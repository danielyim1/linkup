import { randomBytes, randomInt } from "node:crypto";
import { pool, withTx } from "@/server/db";
import { getPlacesProvider } from "@/server/places";
import { mostlyClosed } from "@/server/ranking/rank";
import { buildDeck, type DeckResult } from "@/server/ranking/deck";
import { CURATE_MODEL } from "@/server/ai/curate";
import { mergeGroupPreferences } from "@/server/ranking/group";
import { aiMode, MAX_WISH_LENGTH, parseWish } from "@/server/ai/preferences";
import type { GuestPreferences, MatchInfo, Participant, PriceLevel, Restaurant, RoomFilters, RoomSnapshot, RoomStatus } from "@/lib/types";

// ---------- helpers ----------

export class UserError extends Error {}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I / O — easy to read aloud
const COLORS = ["#FF5A5F", "#FF9F1C", "#2EC4B6", "#7B61FF", "#3A86FF", "#F72585", "#06D6A0", "#FFBE0B", "#8338EC", "#FB5607", "#118AB2", "#EF476F"];
const MAX_PARTICIPANTS = 12;

function newCode() {
  return Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}
function newToken() {
  return randomBytes(24).toString("base64url");
}
export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z]/g, "");
}
function cleanName(name: unknown): string {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!n) throw new UserError("Please enter your name");
  return n;
}
/** Strict majority of the group. 1 → 1, 2 → 2, 3 → 2, 4 → 3, 5 → 3 */
export function likesNeededFor(n: number) {
  return Math.floor(Math.max(n, 1) / 2) + 1;
}

// ---------- create / join / auth ----------

export interface CreateRoomInput {
  hostName: string;
  location: string;
  lat?: number;
  lng?: number;
  filters: RoomFilters;
}

export interface Credentials {
  code: string;
  participantId: string;
  token: string;
}

function sanitizeFilters(f: Partial<RoomFilters> | undefined): RoomFilters {
  const radius = Number(f?.radiusMeters);
  const prices = Array.isArray(f?.priceLevels) ? f!.priceLevels.filter((p): p is PriceLevel => [1, 2, 3, 4].includes(p)) : [];
  const cuisine = typeof f?.cuisine === "string" && f.cuisine.trim() ? f.cuisine.trim().slice(0, 40) : null;
  return {
    radiusMeters: Number.isFinite(radius) ? Math.min(Math.max(radius, 300), 40000) : 2000,
    priceLevels: [...new Set(prices)].sort(),
    cuisine,
  };
}

export async function createRoom(input: CreateRoomInput): Promise<Credentials> {
  const hostName = cleanName(input.hostName);
  const filters = sanitizeFilters(input.filters);
  const provider = getPlacesProvider();

  let lat = Number(input.lat);
  let lng = Number(input.lng);
  let label = String(input.location ?? "").trim().slice(0, 80);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (!label) throw new UserError("Where are you eating? Enter a neighborhood or address.");
    const geo = await provider.geocode(label);
    if (!geo) throw new UserError(`Couldn't find “${label}”. Try a more specific place.`);
    lat = geo.lat;
    lng = geo.lng;
    label = geo.label;
  }
  label ||= "Current location";

  return withTx(async (c) => {
    let roomId: string | undefined;
    let code = "";
    for (let i = 0; i < 6 && !roomId; i++) {
      code = newCode();
      const r = await c.query(
        `INSERT INTO rooms (code, location_label, lat, lng, radius_m, price_levels, cuisine, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO NOTHING RETURNING id`,
        [code, label, lat, lng, filters.radiusMeters, filters.priceLevels, filters.cuisine, provider.name],
      );
      roomId = r.rows[0]?.id;
    }
    if (!roomId) throw new Error("Could not allocate room code");
    const token = newToken();
    const p = await c.query(
      `INSERT INTO participants (room_id, name, color, token, is_host) VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [roomId, hostName, COLORS[randomInt(COLORS.length)], token],
    );
    return { code, participantId: p.rows[0].id, token };
  });
}

export async function joinRoom(rawCode: string, rawName: string): Promise<Credentials> {
  const code = normalizeCode(rawCode);
  const name = cleanName(rawName);
  return withTx(async (c) => {
    const room = await c.query(`SELECT id FROM rooms WHERE code = $1 FOR UPDATE`, [code]);
    if (!room.rowCount) throw new UserError("No room with that code");
    const roomId: string = room.rows[0].id;
    const existing = await c.query(`SELECT color, name FROM participants WHERE room_id = $1`, [roomId]);
    if (existing.rowCount! >= MAX_PARTICIPANTS) throw new UserError("This room is full");
    const used = new Set(existing.rows.map((r) => r.color));
    const color = COLORS.find((col) => !used.has(col)) ?? COLORS[randomInt(COLORS.length)];
    // Avoid two "Alex"es in the lobby
    const names = new Set(existing.rows.map((r) => String(r.name).toLowerCase()));
    let finalName = name;
    for (let i = 2; names.has(finalName.toLowerCase()); i++) finalName = `${name} ${i}`;
    const token = newToken();
    const p = await c.query(
      `INSERT INTO participants (room_id, name, color, token) VALUES ($1,$2,$3,$4) RETURNING id`,
      [roomId, finalName, color, token],
    );
    return { code, participantId: p.rows[0].id, token };
  });
}

export interface AuthedParticipant {
  roomId: string;
  code: string;
  participantId: string;
  isHost: boolean;
}

export async function authenticate(code: string, participantId: string, token: string): Promise<AuthedParticipant | null> {
  if (!/^[0-9a-f-]{36}$/i.test(participantId)) return null;
  const r = await pool.query(
    `SELECT r.id AS room_id, r.code, p.id, p.is_host FROM participants p JOIN rooms r ON r.id = p.room_id
     WHERE r.code = $1 AND p.id = $2 AND p.token = $3`,
    [normalizeCode(code), participantId, token],
  );
  const row = r.rows[0];
  return row ? { roomId: row.room_id, code: row.code, participantId: row.id, isHost: row.is_host } : null;
}

export async function roomExists(code: string) {
  const r = await pool.query(
    `SELECT r.status, r.location_label,
            (SELECT name FROM participants WHERE room_id = r.id AND is_host LIMIT 1) AS host_name,
            (SELECT count(*)::int FROM participants WHERE room_id = r.id) AS people
     FROM rooms r WHERE r.code = $1`,
    [normalizeCode(code)],
  );
  const row = r.rows[0];
  return row
    ? { status: row.status as RoomStatus, locationLabel: row.location_label as string, hostName: row.host_name as string | null, people: row.people as number }
    : null;
}

// ---------- reads ----------

export async function listParticipants(roomId: string, online: Set<string>): Promise<Participant[]> {
  const r = await pool.query(
    `SELECT p.id, p.name, p.color, p.is_host, p.is_ready, p.wish, p.wish_prefs,
            (SELECT count(*)::int FROM votes v WHERE v.participant_id = p.id) AS swiped
     FROM participants p WHERE p.room_id = $1 ORDER BY p.joined_at`,
    [roomId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isHost: row.is_host,
    isReady: row.is_ready,
    online: online.has(row.id),
    swipedCount: row.swiped,
    wish: row.wish,
    wishPrefs: row.wish_prefs,
  }));
}

async function listMatches(roomId: string): Promise<MatchInfo[]> {
  const r = await pool.query(`SELECT place_id, likes, matched_at FROM matches WHERE room_id = $1 ORDER BY matched_at`, [roomId]);
  return r.rows.map((m) => ({ restaurantId: m.place_id, likes: m.likes, matchedAt: m.matched_at.toISOString() }));
}

/** Like counts per restaurant — only revealed once every participant has swiped the whole deck. */
export async function finalTallyIfDone(roomId: string): Promise<Record<string, number> | null> {
  const r = await pool.query(
    `SELECT
       (SELECT count(*) FROM room_restaurants WHERE room_id = $1)::int AS deck,
       (SELECT count(*) FROM participants WHERE room_id = $1)::int AS people,
       (SELECT count(*) FROM votes WHERE room_id = $1)::int AS votes,
       (SELECT status FROM rooms WHERE id = $1) AS status`,
    [roomId],
  );
  const { deck, people, votes, status } = r.rows[0];
  if (status !== "swiping" || deck === 0 || votes < deck * people) return null;
  const t = await pool.query(
    `SELECT place_id, count(*) FILTER (WHERE liked)::int AS likes FROM votes WHERE room_id = $1 GROUP BY place_id`,
    [roomId],
  );
  return Object.fromEntries(t.rows.map((row) => [row.place_id, row.likes]));
}

export async function getSnapshot(roomId: string, participantId: string, online: Set<string>): Promise<RoomSnapshot> {
  const roomQ = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
  const room = roomQ.rows[0];
  const [participants, restaurantsQ, votesQ, matches, finalTally] = await Promise.all([
    listParticipants(roomId, online),
    pool.query(`SELECT data FROM room_restaurants WHERE room_id = $1 ORDER BY position`, [roomId]),
    pool.query(`SELECT place_id, liked FROM votes WHERE participant_id = $1`, [participantId]),
    listMatches(roomId),
    finalTallyIfDone(roomId),
  ]);
  return {
    code: room.code,
    status: room.status,
    locationLabel: room.location_label,
    provider: room.provider,
    filters: { radiusMeters: room.radius_m, priceLevels: room.price_levels, cuisine: room.cuisine },
    participants,
    restaurants: restaurantsQ.rows.map((r) => r.data as Restaurant),
    myVotes: Object.fromEntries(votesQ.rows.map((v) => [v.place_id, v.liked])),
    matches,
    likesNeeded: likesNeededFor(participants.length),
    finalTally,
    aiMode: aiMode(),
    groupVibe: (room.preferences?.summary as string | undefined) ?? null,
    curatedBy: (room.preferences?.curatedBy as "ai" | "rules" | undefined) ?? (room.status === "swiping" ? "rules" : null),
  };
}

// ---------- lobby actions ----------

export async function setReady(roomId: string, participantId: string, ready: boolean) {
  await pool.query(`UPDATE participants SET is_ready = $3 WHERE id = $2 AND room_id = $1`, [roomId, participantId, ready]);
}

export async function resetReady(roomId: string) {
  await pool.query(`UPDATE participants SET is_ready = false WHERE room_id = $1`, [roomId]);
}

export async function everyoneReady(roomId: string): Promise<boolean> {
  const r = await pool.query(`SELECT bool_and(is_ready) AS all_ready, count(*)::int AS n FROM participants WHERE room_id = $1`, [roomId]);
  return r.rows[0].n > 0 && r.rows[0].all_ready === true;
}

/**
 * Save what someone is in the mood for and turn it into structured preferences.
 * Empty text clears their wish. Only allowed in the lobby (the deck is frozen after start).
 */
export async function setWish(roomId: string, participantId: string, text: string): Promise<GuestPreferences | null> {
  const status = await pool.query(`SELECT status FROM rooms WHERE id = $1`, [roomId]);
  if (status.rows[0]?.status !== "lobby") throw new UserError("Swiping already started — wishes are locked in");
  const wish = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_WISH_LENGTH);
  if (!wish) {
    await pool.query(`UPDATE participants SET wish = NULL, wish_prefs = NULL WHERE id = $1 AND room_id = $2`, [participantId, roomId]);
    return null;
  }
  const { prefs } = await parseWish(wish);
  await pool.query(`UPDATE participants SET wish = $3, wish_prefs = $4 WHERE id = $1 AND room_id = $2`, [participantId, roomId, wish, prefs]);
  return prefs;
}

/** Prints how a deck was built, so you can see why the cards came out the way they did. */
function logDeck(
  code: string,
  group: ReturnType<typeof mergeGroupPreferences>,
  tunedFilters: RoomFilters,
  plainCount: number,
  tunedCount: number,
  found: Restaurant[],
  deck: DeckResult,
) {
  const price = (l: number | null) => (l ? "$".repeat(l) : "?");
  const byPrice = [1, 2, 3, 4, null].map((l) => `${price(l)}:${found.filter((r) => r.priceLevel === l).length}`).join(" ");
  const closed = found.filter((r) => r.openNow === false).length;
  console.log(`\n[deck ${code}] wishes → ${group ? group.summary : "none"}`);
  if (group) console.log(`  wanted price: ${group.priceLevels.map(price).join(", ") || "any"} | cuisines: ${Object.keys(group.cuisineWeights).join(", ") || "any"}`);
  console.log(`  searches: plain=${plainCount} places, tuned=${tunedCount} places (query: ${group?.searchQuery ?? "—"}, prices: ${tunedFilters.priceLevels.map(price).join(",") || "any"})`);
  console.log(`  pool: ${found.length} places | ${byPrice} | closed now: ${closed}${mostlyClosed(found) ? " (mostly closed → ignoring open hours)" : ""}`);
  console.log(
    deck.curatedBy === "ai"
      ? `  order: picked by Claude (${CURATE_MODEL}) in ${((deck.aiMs ?? 0) / 1000).toFixed(1)}s`
      : `  order: rules${deck.aiError ? ` (Claude failed: ${deck.aiError})` : group ? "" : " (no wishes, so Claude wasn't asked)"}`,
  );
  for (const [i, r] of deck.cards.slice(0, 5).entries()) {
    const why = r.aiReason ? `✨ ${r.aiReason}` : (r.fit ?? []).join(" · ");
    console.log(`  ${i + 1}. ${r.name} (${r.cuisine ?? "?"}, ${price(r.priceLevel)}${r.openNow === false ? ", closed" : ""}) score ${(deck.scores.get(r.id) ?? 0).toFixed(1)} ${why}`);
  }
}

const starting = new Set<string>();

/**
 * Fetch, rank and freeze the restaurant pool, then flip the room to swiping.
 * Returns false if the room was already started (or is starting).
 */
export async function startRoom(roomId: string): Promise<boolean> {
  if (starting.has(roomId)) return false;
  starting.add(roomId);
  try {
    const roomQ = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
    const room = roomQ.rows[0];
    if (!room || room.status !== "lobby") return false;

    const filters: RoomFilters = { radiusMeters: room.radius_m, priceLevels: room.price_levels, cuisine: room.cuisine };
    const people = await pool.query(`SELECT wish, wish_prefs FROM participants WHERE room_id = $1 ORDER BY joined_at`, [roomId]);
    const withWish = people.rows.filter((r) => r.wish && r.wish_prefs);
    const group = mergeGroupPreferences(withWish.map((r) => r.wish_prefs as GuestPreferences));
    const wishes = withWish
      .filter((r) => (r.wish_prefs as GuestPreferences).summary !== "no preference" || String(r.wish).length > 3)
      .map((r) => ({ text: String(r.wish), summary: (r.wish_prefs as GuestPreferences).summary, prefs: r.wish_prefs as GuestPreferences }));

    const provider = getPlacesProvider();
    const geo = { lat: room.lat, lng: room.lng };
    // Base search plus, when the group described what they want, a second search phrased the way
    // they talked and limited to the price they asked for — so the deck actually contains
    // e.g. upscale Asian places for the ranking to pick from. The room's own price filter always wins.
    const wantsPrice = !filters.priceLevels.length && (group?.priceLevels.length ?? 0) > 0;
    const tunedFilters: RoomFilters = wantsPrice ? { ...filters, priceLevels: group!.priceLevels } : filters;
    const [plain, tuned] = await Promise.all([
      provider.search({ ...geo, filters }),
      group && (group.searchQuery || wantsPrice)
        ? provider.search({ ...geo, filters: tunedFilters, query: group.searchQuery ?? undefined }).catch(() => [])
        : Promise.resolve([]),
    ]);
    const seen = new Set(plain.map((r) => r.id));
    let found = [...plain, ...tuned.filter((r) => !seen.has(r.id))];
    // Too picky? Widen once: drop the price filter, then double the radius.
    if (found.length < 6 && filters.priceLevels.length) {
      found = await provider.search({ lat: room.lat, lng: room.lng, filters: { ...filters, priceLevels: [] } });
    }
    if (found.length < 6) {
      const wider = { ...filters, radiusMeters: Math.min(filters.radiusMeters * 2, 40000) };
      const more = await provider.search({ lat: room.lat, lng: room.lng, filters: wider });
      const ids = new Set(found.map((r) => r.id));
      found = [...found, ...more.filter((r) => !ids.has(r.id))];
    }
    if (!found.length) throw new UserError("No restaurants found nearby. Try a bigger distance or fewer filters.");

    const deck = await buildDeck({ found, filters, group, wishes, groupSize: people.rowCount ?? 1 });
    logDeck(room.code, group, tunedFilters, plain.length, tuned.length, found, deck);

    return await withTx(async (c) => {
      const upd = await c.query(
        `UPDATE rooms SET status = 'swiping', started_at = now(), preferences = $2 WHERE id = $1 AND status = 'lobby'`,
        [roomId, { ...(group ?? {}), curatedBy: deck.curatedBy }],
      );
      if (!upd.rowCount) return false;
      for (const [i, card] of deck.cards.entries()) {
        await c.query(
          `INSERT INTO room_restaurants (room_id, place_id, position, score, data) VALUES ($1,$2,$3,$4,$5)`,
          [roomId, card.id, i, deck.scores.get(card.id) ?? null, card],
        );
      }
      return true;
    });
  } finally {
    starting.delete(roomId);
  }
}

// ---------- voting ----------

export interface VoteResult {
  newMatch: MatchInfo | null;
  swipedCount: number;
  finalTally: Record<string, number> | null;
}

export async function castVote(roomId: string, participantId: string, placeId: string, liked: boolean): Promise<VoteResult> {
  const inDeck = await pool.query(
    `SELECT 1 FROM room_restaurants rr JOIN rooms r ON r.id = rr.room_id
     WHERE rr.room_id = $1 AND rr.place_id = $2 AND r.status = 'swiping'`,
    [roomId, placeId],
  );
  if (!inDeck.rowCount) throw new UserError("That restaurant isn't in this room");

  // Autocommit (no surrounding tx) on purpose: the like count below must see
  // concurrently committed likes so two simultaneous swipes can't both miss the match.
  await pool.query(
    `INSERT INTO votes (room_id, participant_id, place_id, liked) VALUES ($1,$2,$3,$4)
     ON CONFLICT (participant_id, place_id) DO UPDATE SET liked = EXCLUDED.liked, created_at = now()`,
    [roomId, participantId, placeId, liked],
  );

  let newMatch: MatchInfo | null = null;
  if (liked) {
    const r = await pool.query(
      `SELECT (SELECT count(*) FROM votes WHERE room_id = $1 AND place_id = $2 AND liked)::int AS likes,
              (SELECT count(*) FROM participants WHERE room_id = $1)::int AS people`,
      [roomId, placeId],
    );
    const { likes, people } = r.rows[0];
    if (likes >= likesNeededFor(people)) {
      const ins = await pool.query(
        `INSERT INTO matches (room_id, place_id, likes) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING matched_at`,
        [roomId, placeId, likes],
      );
      if (ins.rowCount) newMatch = { restaurantId: placeId, likes, matchedAt: ins.rows[0].matched_at.toISOString() };
    }
  }

  const sc = await pool.query(`SELECT count(*)::int AS n FROM votes WHERE participant_id = $1`, [participantId]);
  return { newMatch, swipedCount: sc.rows[0].n, finalTally: await finalTallyIfDone(roomId) };
}
