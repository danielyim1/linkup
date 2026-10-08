/**
 * End-to-end smoke test: simulates a group of friends against a running server.
 *   npm run dev   (in one terminal)
 *   npm run smoke (in another)
 */
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, MatchInfo, RoomSnapshot, ServerToClient } from "../src/lib/types";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
type Sock = Socket<ServerToClient, ClientToServer>;

let failures = 0;
function check(cond: unknown, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}

class Friend {
  sock: Sock;
  snap: RoomSnapshot | null = null;
  matches: MatchInfo[] = [];
  tally: Record<string, number> | null = null;
  constructor(public name: string, public creds: { code: string; participantId: string; token: string }) {
    this.sock = io(BASE, { transports: ["websocket"], forceNew: true });
    this.sock.on("room:snapshot", (s) => (this.snap = s));
    this.sock.on("room:participants", ({ participants }) => this.snap && (this.snap.participants = participants));
    this.sock.on("match:new", (m) => this.matches.push(m));
    this.sock.on("room:tally", (t) => (this.tally = t));
  }
  join() {
    return new Promise<void>((resolve, reject) =>
      this.sock.emit("room:join", this.creds, (r) => (r.ok ? resolve() : reject(new Error(r.error)))),
    );
  }
  wish(text: string) {
    return new Promise<import("../src/lib/types").GuestPreferences | null>((resolve, reject) =>
      this.sock.emit("wish:set", { text }, (r) => (r.ok ? resolve(r.prefs) : reject(new Error(r.error)))),
    );
  }
  vote(id: string, liked: boolean) {
    return new Promise<void>((resolve, reject) =>
      this.sock.emit("vote:cast", { restaurantId: id, liked }, (r) => (r.ok ? resolve() : reject(new Error(r.error)))),
    );
  }
}

async function until(fn: () => boolean, label: string, ms = 8000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(50);
  }
}

const host = await post("/api/rooms", {
  name: "Alex",
  location: "Mission District, San Francisco",
  filters: { radiusMeters: 3200, priceLevels: [1, 2], cuisine: null },
});
check(/^[A-Z]{5}$/.test(host.code), `room created: ${host.code}`);

const lookup = await fetch(`${BASE}/api/rooms/${host.code.toLowerCase()}`).then((r) => r.json());
check(lookup.hostName === "Alex" && lookup.status === "lobby", "room lookup is case-insensitive and shows host");

const bCreds = await post(`/api/rooms/${host.code}/join`, { name: "Bea" });
const cCreds = await post(`/api/rooms/${host.code}/join`, { name: "Alex" });
const a = new Friend("Alex", host);
const b = new Friend("Bea", bCreds);
const c = new Friend("Alex 2", cCreds);
await Promise.all([a.join(), b.join(), c.join()]);
await until(() => a.snap?.participants.length === 3 && a.snap.participants.every((p) => p.online), "lobby shows 3 online");
check(a.snap!.participants.map((p) => p.name).join(",") === "Alex,Bea,Alex 2", "duplicate names are disambiguated");
check(a.snap!.likesNeeded === 2, "3 people → 2 likes needed");

const bad = new Friend("Eve", { ...bCreds, token: "nope" });
await bad.join().then(
  () => check(false, "bad token rejected"),
  (e) => check(e.message === "not_member", "bad token rejected"),
);
bad.sock.disconnect();

// AI wishes: each person can say what they're in the mood for
const prefs = await a.wish("I want somewhere casual and not too expensive where we can actually talk");
check(prefs && prefs.vibes.includes("quiet") && prefs.priceLevels.join() === "1,2", `wish parsed (${a.snap!.aiMode}): ${prefs?.summary}`);
await b.wish("I'm vegetarian");
await until(() => c.snap!.participants.filter((p) => p.wishPrefs).length === 2, "others see parsed wishes");
check(true, "parsed wishes broadcast to the group");
await c.wish("no sushi please");
await c.wish("");
await until(() => a.snap!.participants.find((p) => p.name === "Alex 2")!.wish === null, "cleared wish syncs");
check(true, "clearing a wish works");

// Two ready up; room must stay in lobby until the third does
a.sock.emit("room:ready", { ready: true });
b.sock.emit("room:ready", { ready: true });
await sleep(400);
check(a.snap!.status === "lobby", "room waits for everyone to be ready");
c.sock.emit("room:ready", { ready: true });
await until(() => [a, b, c].every((f) => f.snap?.status === "swiping"), "everyone moved to swiping");
const deck = a.snap!.restaurants;
check(deck.length >= 6, `deck has ${deck.length} restaurants`);
check(JSON.stringify(deck.map((r) => r.id)) === JSON.stringify(b.snap!.restaurants.map((r) => r.id)), "everyone sees the same deck");
check(deck.every((r) => !r.priceLevel || r.priceLevel <= 2), "price filter applied");
check(!!a.snap!.groupVibe, `deck tuned for: ${a.snap!.groupVibe}`);
check(deck.slice(0, 5).every((r) => r.fit?.length), `top cards explain fit: ${deck[0].name} → ${deck[0].fit?.join(", ")}`);
await a.wish("actually, fancy").then(
  () => check(false, "wishes lock once swiping starts"),
  () => check(true, "wishes lock once swiping starts"),
);

// Card 0: Alex likes, Alex 2 passes, Bea likes → match on Bea's swipe
await a.vote(deck[0].id, true);
await c.vote(deck[0].id, false);
await sleep(200);
check(a.matches.length === 0, "no match after 1 of 3 likes");
await b.vote(deck[0].id, true);
await until(() => [a, b, c].every((f) => f.matches.length === 1), "match broadcast to all three");
check(c.matches[0].restaurantId === deck[0].id && c.matches[0].likes === 2, "match is card 0 with 2 likes");

// Privacy: a reconnecting client only gets its own votes back
const c2 = new Friend("Alex 2 (phone 2)", cCreds);
await c2.join();
await until(() => !!c2.snap, "reconnect snapshot");
check(JSON.stringify(c2.snap!.myVotes) === JSON.stringify({ [deck[0].id]: false }), "snapshot contains only my own votes");
check(c2.snap!.finalTally === null, "tally hidden while people are still swiping");
check(c2.snap!.matches.length === 1, "matches restored on reconnect");
c2.sock.disconnect();

// Race: Alex and Bea like card 1 at the same instant → exactly one match event
await Promise.all([a.vote(deck[1].id, true), b.vote(deck[1].id, true)]);
await sleep(400);
check(a.matches.filter((m) => m.restaurantId === deck[1].id).length === 1, "simultaneous likes produce exactly one match");

// Progress sync
await until(() => a.snap!.participants.find((p) => p.name === "Bea")!.swipedCount === 2, "Alex sees Bea's progress");
check(true, "progress counts sync in real time");

// Everyone finishes the deck → tally revealed
for (const f of [a, b, c]) {
  for (const r of deck) if (!(f === a || f === b ? [deck[0].id, deck[1].id] : [deck[0].id]).includes(r.id)) await f.vote(r.id, false);
}
await until(() => [a, b, c].every((f) => f.tally), "final tally sent when everyone is done");
check(a.tally![deck[0].id] === 2 && a.tally![deck[1].id] === 2 && a.tally![deck[2].id] === 0, "tally has aggregate like counts");

// Vote on something not in the deck
await a.vote("not-a-place", true).then(
  () => check(false, "rejects votes for unknown restaurants"),
  () => check(true, "rejects votes for unknown restaurants"),
);

for (const f of [a, b, c]) f.sock.disconnect();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed 🎉");
process.exit(failures ? 1 : 0);
