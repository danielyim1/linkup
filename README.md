# LinkUp

Decide where to eat, together. One person creates a room, friends join from their phones, everyone privately swipes on the same deck of nearby restaurants, and the first place a majority likes becomes a match.

## Quick start

Requirements: Node 22+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL (+ GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY)
createdb linkup               # or point DATABASE_URL at any Postgres
npm run dev                   # http://localhost:3000 — schema is applied on boot
```

Without `GOOGLE_PLACES_API_KEY` the app runs on a built-in set of demo restaurants, so you can try the whole flow immediately.

### Real restaurants (Google Places)

1. In Google Cloud, enable **Places API (New)** and create an API key.
2. Restrict the key to Places API (New). It is only ever used server-side — photos are proxied through `/api/photo`, so the key never reaches the browser.
3. Put it in `.env` as `GOOGLE_PLACES_API_KEY=...` and restart.

### Testing with friends' phones

- **Same Wi-Fi:** run `npm run dev`, then open `http://<your-laptop-ip>:3000` on phones. (“Use my location” needs HTTPS on phones, so type a neighborhood instead, or use a tunnel.)
- **Anywhere:** `npx cloudflared tunnel --url http://localhost:3000` (or ngrok) gives you an HTTPS link to share.
- **Deploy:** any host that runs a long-lived Node process with WebSockets: Railway, Render, Fly.io. Set `DATABASE_URL`, `GOOGLE_PLACES_API_KEY`, `NODE_ENV=production` (and `DATABASE_SSL=true` for most managed Postgres), then `npm run build && npm start`. Vercel's serverless functions can't hold WebSocket connections, so don't use it for this server as-is.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js + Socket.IO in one process, with reload on server changes |
| `npm run build` / `npm start` | Production build / server |
| `npm run smoke` | Simulates three friends against a running server: join, ready-up, private voting, majority match, simultaneous-like race, reconnect, final tally |
| `npm run db:migrate` | Apply `db/schema.sql` manually (also runs on boot) |
| `npm run typecheck` | TypeScript check |
| `npm run eval:prefs` | Score the AI preference parser on 10 test wishes |
| `npm run rank:demo` | Show how wishes re-rank the deck (demo data; `-- --ai` for Claude) |
| `npm run eval:deck` | Score deck quality on 8 group scenarios (`-- --ai` compares rules vs Claude) |
| `npm run check` | Run every check in order (typecheck, eval, ranking demo, smoke) |
| `npm run mcp:db` | Start the read-only database MCP server by hand (Claude Code starts it automatically) |

## Working on LinkUp with Claude Code

This repo includes a Claude Code setup: `CLAUDE.md`, skills (`/check-everything`, `/debug-deck`, `/add-food-word`), two subagents, hooks that protect `.env` and type-check every edit, and a read-only database MCP server. See **[.claude/README.md](.claude/README.md)** for what each piece does and why.

## How it works

```
Phone ──HTTP──▶ Next.js route handlers   (create room, join, photo proxy)
      ◀─WS───▶ Socket.IO                  (lobby, ready/start, votes, matches)
                     │
                     ▼
            services/rooms.ts  ── rules: majority, privacy, start/widen search
             │            │
             ▼            ▼
        PostgreSQL    places/  (Google Places | demo)  →  ranking/rank.ts
```

**Flow.** Create a room (name, location or GPS, distance, price, optional cuisine) → share the 5-letter code or link → friends join with a name → everyone taps Ready (the host can also start without waiting) → the server fetches places, ranks them, and freezes one deck for the room → everyone swipes independently → a restaurant that reaches a strict majority of likes (2 of 2, 2 of 3, 3 of 4…) is broadcast as a match → when everyone finishes, the aggregate like counts are revealed.

**Privacy.** Votes are stored per participant but never broadcast. Clients only receive their own votes, live progress counts (how many cards each friend has swiped), matches, and — once everyone has finished — per-restaurant like totals. Nobody ever sees who liked what.

**Identity.** No accounts. Joining returns a participant id plus a secret token, stored in `localStorage` per room. Refreshing or reopening the link reconnects you to the same seat with your votes intact.

**Correctness.** Votes commit before the like count is read, and matches insert with `ON CONFLICT DO NOTHING`, so two friends liking at the same instant produce exactly one match. If the filters are too strict, the start step widens the search once (drops price, then doubles the radius) before giving up.

## Project layout

```
server.ts                       Custom server: Next.js handler + Socket.IO on one port
db/schema.sql                   Tables: rooms, participants, room_restaurants, votes, matches
src/lib/types.ts                Types shared by server and browser (incl. socket events)
src/lib/client/                 useRoom hook (socket state), localStorage session
src/server/services/rooms.ts    All room/vote/match rules
src/server/realtime/socket.ts   Socket.IO handlers, presence, per-user snapshots
src/server/places/              PlacesProvider interface + Google and demo providers
src/server/ai/                  Claude client + wish → preferences parser (with keyword fallback)
src/server/ranking/group.ts     Merge everyone's wishes into group preferences
src/server/ranking/rank.ts      Scoring: quality, distance, and fit with the group's wishes
src/app/                        Pages (home, create, room) and API routes
src/components/room/            Lobby, SwipeDeck, MatchOverlay, DetailSheet, Results
```

## AI: “what are you in the mood for?”

In the lobby, everyone can type what they want in plain words, like *“somewhere casual and not too expensive where we can actually talk.”* An LLM turns each wish into structured preferences, the group's wishes are merged, and the deck is re-ranked. Each card shows why it fits (✨ Easy to talk · Fits budget).

**Setup:** add `ANTHROPIC_API_KEY=...` to `.env` (get one at console.anthropic.com) and restart. Without a key, LinkUp uses a simple keyword matcher instead, so the feature still works, just less cleverly. The lobby says which mode is on.

### How it works, step by step

| Step | What happens | File |
| --- | --- | --- |
| 1. Wish | Phone sends the text over the socket (`wish:set`) | `src/components/room/WishBox.tsx`, `src/lib/client/useRoom.ts` |
| 2. Parse | Server asks Claude to fill in a **JSON schema** (structured outputs), then validates and cleans the result | `src/server/ai/preferences.ts` |
| 3. Fallback | If there's no key or the call fails, a regex keyword parser fills in the same shape | `src/server/ai/preferences.ts` (`parseWithKeywords`) |
| 4. Merge | Everyone's wishes become one set of weighted group preferences (3 of 4 people saying “quiet” counts more than 1) | `src/server/ranking/group.ts` |
| 5. Search | If the group agrees on something, an extra places search is phrased the way they talked (“quiet casual restaurant”) | `src/server/services/rooms.ts` (`startRoom`) |
| 6. Pre-sort | Rules give each restaurant points for quality, distance, hours, and fit with the wishes | `src/server/ranking/rank.ts` |
| 7. **Claude picks the deck** | Claude reads the top 40 places and everyone's wishes, then chooses and orders the best ones with a reason per card ("Upscale omakase, fits the splurge") | `src/server/ai/curate.ts` |
| 8. Safety net + fill | Code makes sure no refused cuisine or dietary clash leads the deck, then fills to 30 cards. On any AI problem, the rule order from step 6 is used. | `src/server/ranking/deck.ts` |

Claude does the judgment: understanding what people meant, and balancing a group whose wishes differ. Code does what must be guaranteed: fast pre-sorting, hard needs, and a working fallback. The terminal's `[deck CODE]` report says which one ordered each room.

**Is Claude actually better?** Measure it: `npm run eval:deck -- --ai` runs 8 group scenarios through both the rules and Claude, with automatic checks ("expensive asian food" → no $ places in the top 3).

### Things to try (good for learning)

- `npm run rank:demo`: see how three wishes change the top 8, with no API keys needed. Add `--ai` to let Claude pick. Pass your own: `npm run rank:demo -- "date night" "I'm vegan"`.
- `npm run eval:prefs`: a mini **eval**. 10 test wishes with expected results. Run it with and without `-- --basic` to compare Claude with the keyword fallback. Then edit `SYSTEM_PROMPT` in `src/server/ai/preferences.ts` and see whether the score changes. Add a case whenever the app misunderstands someone.
- Change `ANTHROPIC_MODEL` in `.env` to compare models.

### Next AI steps (not built yet)

- **“Find us a compromise”:** when the group finishes without a match, send the tally and everyone's wishes (never individual votes) to Claude and ask for one pick with a one-line reason.
- ~~Claude picks the deck~~ (done)
- **Embeddings:** replace the keyword `vibeMatch` in `rank.ts` with similarity between the group's wishes and each restaurant's description (pgvector in the same Postgres).
- **Recommendations:** `votes` is already a clean (person, place, liked) log.
