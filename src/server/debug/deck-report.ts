/**
 * Developer tool: explain why a room's deck came out the way it did.
 * Used by the debug-deck skill (.claude/skills/debug-deck) and the LinkUp DB MCP server (mcp/).
 *
 * Privacy: reports wishes and aggregate like counts only — never who voted for what.
 */
import { pool } from "@/server/db";
import { mergeGroupPreferences } from "@/server/ranking/group";
import { explainScore, mostlyClosed, preferencesFromFilters } from "@/server/ranking/rank";
import type { GuestPreferences, Restaurant, RoomFilters } from "@/lib/types";

const price = (l: number | null | undefined) => (l ? "$".repeat(l) : "?");
const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

export async function latestRoomCode(): Promise<string | null> {
  const r = await pool.query(`SELECT code FROM rooms ORDER BY created_at DESC LIMIT 1`);
  return r.rows[0]?.code ?? null;
}

export async function listRooms(limit = 10): Promise<string> {
  const r = await pool.query(
    `SELECT r.code, r.status, r.location_label, r.created_at, r.price_levels, r.cuisine,
            (SELECT count(*) FROM participants p WHERE p.room_id = r.id)::int AS people,
            (SELECT count(*) FROM matches m WHERE m.room_id = r.id)::int AS matches
     FROM rooms r ORDER BY r.created_at DESC LIMIT $1`,
    [limit],
  );
  if (!r.rowCount) return "No rooms yet.";
  return r.rows
    .map(
      (x) =>
        `${x.code}  ${x.status.padEnd(8)} ${x.people} people, ${x.matches} matches  near ${x.location_label}  ` +
        `price filter: ${x.price_levels.length ? x.price_levels.map(price).join(",") : "any"}  cuisine: ${x.cuisine ?? "any"}  ` +
        `(${new Date(x.created_at).toLocaleString()})`,
    )
    .join("\n");
}

export async function explainRoom(code: string, opts: { limit?: number; name?: string } = {}): Promise<string> {
  const roomQ = await pool.query(`SELECT * FROM rooms WHERE code = $1`, [code.toUpperCase()]);
  const room = roomQ.rows[0];
  if (!room) return `No room ${code}.`;

  const [peopleQ, deckQ, likesQ] = await Promise.all([
    pool.query(`SELECT name, wish, wish_prefs FROM participants WHERE room_id = $1 ORDER BY joined_at`, [room.id]),
    pool.query(`SELECT data, score, position FROM room_restaurants WHERE room_id = $1 ORDER BY position`, [room.id]),
    pool.query(`SELECT place_id, count(*) FILTER (WHERE liked)::int AS likes, count(*)::int AS votes FROM votes WHERE room_id = $1 GROUP BY place_id`, [room.id]),
  ]);

  const filters: RoomFilters = { radiusMeters: room.radius_m, priceLevels: room.price_levels, cuisine: room.cuisine };
  const wishes = peopleQ.rows.filter((p) => p.wish_prefs).map((p) => p.wish_prefs as GuestPreferences);
  const group = mergeGroupPreferences(wishes);
  const deck = deckQ.rows.map((r) => r.data as Restaurant);
  const prefs = { ...preferencesFromFilters(filters, group), ignoreOpenNow: mostlyClosed(deck) };
  const likes = new Map(likesQ.rows.map((r) => [r.place_id, r]));

  const out: string[] = [];
  out.push(`Room ${room.code} — ${room.status}, near ${room.location_label}, radius ${room.radius_m}m`);
  out.push(`Room filters (hard): price ${filters.priceLevels.length ? filters.priceLevels.map(price).join(",") : "any"}, cuisine ${filters.cuisine ?? "any"}`);
  out.push(`People and wishes:`);
  for (const p of peopleQ.rows) out.push(`  - ${p.name}: ${p.wish ? `"${p.wish}" → ${p.wish_prefs?.summary}` : "(no wish)"}`);
  out.push(
    group
      ? `Group preferences: ${group.summary}\n  price ${group.priceLevels.map(price).join(",") || "any"} | cuisines ${JSON.stringify(group.cuisineWeights)} | avoid ${group.cuisinesAvoid.join(",") || "-"} | vibes ${JSON.stringify(group.vibeWeights)} | extra search: ${group.searchQuery ?? "none"}`
      : "Group preferences: none (deck ranked by rating, distance and open hours only)",
  );
  if (!deck.length) {
    out.push("\nDeck not built yet (room still in the lobby).");
    return out.join("\n");
  }
  const byPrice = [1, 2, 3, 4, null].map((l) => `${price(l)}:${deck.filter((r) => r.priceLevel === l).length}`).join(" ");
  out.push(`Deck: ${deck.length} cards | ${byPrice} | closed now: ${deck.filter((r) => r.openNow === false).length}${prefs.ignoreOpenNow ? " (mostly closed → open hours ignored)" : ""}`);
  out.push(
    room.preferences?.curatedBy === "ai"
      ? "Order: picked by Claude (positions follow Claude's choice; the scores below are the rule-based pre-sort it started from)"
      : "Order: rules (sorted by the scores below)",
  );
  out.push(`Note: only the frozen deck is stored; places that didn't make the top ${deck.length} aren't shown.`);

  const chosen = opts.name
    ? deck.filter((r) => r.name.toLowerCase().includes(opts.name!.toLowerCase()))
    : deck.slice(0, opts.limit ?? 8);
  if (opts.name && !chosen.length) out.push(`\nNo card matching "${opts.name}" in this deck.`);

  for (const r of chosen) {
    const pos = deck.indexOf(r) + 1;
    const e = explainScore(r, prefs);
    const l = likes.get(r.id);
    out.push(
      `\n#${pos} ${r.name} — ${r.cuisine ?? "?"}, ${price(r.priceLevel)}, ★${r.rating ?? "?"}, ${r.openNow === false ? "closed" : r.openNow ? "open" : "hours ?"}` +
        `${l ? `, ${l.likes}/${l.votes} likes so far` : ""}\n   rule score ${e.score.toFixed(2)}${e.reasons.length ? `  ✨ ${e.reasons.join(" · ")}` : ""}` +
        (r.aiReason ? `\n   Claude's reason: "${r.aiReason}"` : ""),
    );
    for (const [label, pts] of e.parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) out.push(`     ${fmt(pts).padStart(6)}  ${label}`);
  }
  return out.join("\n");
}
