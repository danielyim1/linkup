# LinkUp

Mobile-first web app where a group of friends picks a restaurant together. A host creates a room, friends join with a 5-letter code, everyone privately swipes the same deck of nearby restaurants, and the first place a strict majority likes becomes a match.

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4, PostgreSQL (`pg`), Socket.IO, Google Places API (New), Claude API (`@anthropic-ai/sdk`).

## Commands

- `npm run dev`: start the app at http://localhost:3000. One process runs Next.js and Socket.IO (`server.ts`). Restarts on server-code changes.
- `npm run typecheck`: TypeScript check. Run after every change.
- `npm run smoke`: end-to-end test with simulated friends. **Needs the app already running** in another terminal.
- `npm run eval:prefs`: scores the wish parser on test wishes (`-- --basic` forces the keyword fallback).
- `npm run rank:demo -- "wish one" "wish two"`: shows how wishes re-rank a demo deck. Needs no keys. Add `--ai` to let Claude pick.
- `npm run eval:deck`: scores deck quality on 8 group scenarios (rules). `-- --ai` adds a Claude column. That makes ~8 paid calls, so only run it when the user agrees.
- `/check-everything` (skill) runs all of the above in the right order.

## Where things live

- `server.ts`: custom HTTP server (Next.js + Socket.IO on one port)
- `src/server/services/rooms.ts`: all room rules: create/join, start (search → rank → freeze deck), votes, matches
- `src/server/realtime/socket.ts`: socket events and presence. Event types are in `src/lib/types.ts`.
- `src/server/ai/preferences.ts`: wish → structured preferences (Claude structured output, keyword fallback)
- `src/server/ai/curate.ts`: Claude picks and orders the deck from the top 40 candidates, with a reason per card
- `src/server/ranking/`: `deck.ts` builds the deck (rules pre-sort → Claude curation → safety net → fill to 30), `group.ts` merges wishes, `rank.ts` rule scoring, `cuisines.ts` food vocabulary
- `src/server/places/`: `PlacesProvider` interface with `google.ts` and `demo.ts`
- `src/components/room/`: Lobby, WishBox, SwipeDeck, MatchOverlay, DetailSheet, Results
- `db/schema.sql`: schema, applied on every boot. Only add idempotent statements (`IF NOT EXISTS`).
- `mcp/linkup-db.ts`: read-only MCP server for inspecting the local database

## Rules that must never break

- **Votes are private.** Never send one person's votes to another person's browser. Clients get their own votes, progress counts, matches, and aggregate like counts only after everyone finishes. Any change to `socket.ts`, `getSnapshot`, or `types.ts` needs a check by the `privacy-reviewer` agent.
- **API keys stay on the server.** Never import `src/server/**` from client components. Never put keys in `NEXT_PUBLIC_*` vars. Google photos go through `/api/photo`.
- **Never read or print `.env`.** It holds the user's real keys. A hook blocks it. To check whether keys are configured, look at the session-start status or the app's startup lines.
- **The room's filters are hard; wishes are soft.** Price/cuisine chosen at room creation filter the search. Wishes only re-rank and add an extra search.
- **Match = strict majority** (`likesNeededFor`: 1→1, 2→2, 3→2, 4→3). Votes commit before the like count is read, so simultaneous likes produce exactly one match.

## Conventions

- AI calls fail soft: if Claude errors or no key is set, fall back (see `parseWish`). The app must work without any API keys (demo restaurants + keyword parser).
- Deck pipeline: Google search → rules pre-sort (`rank.ts`) → **Claude picks the order** when anyone made a wish (`curate.ts`) → **guarantees** in `deck.ts`, applied to either order → fill with rule order. Without a key or on any AI error, the rule order is used.
- Guarantees are product promises enforced in code, never left to the model: refused cuisines and dietary clashes never lead; if most of the group named a cuisine, matching places come first; everyone who named a cuisine/price/diet gets an option in the top 5 (falling back to the closest related cuisine). Claude decides everything within those bounds.
- Eval history: on the first real run, Haiku scored 11/14 vs rules 13/14. It was better at vegetarian picks and worse at "cuisine beats price." Re-run `npm run eval:deck -- --ai` after any prompt, model, or guarantee change and compare.
- When a deck looks wrong, first check the `[deck CODE]` terminal report: was it `picked by Claude` or `rules`? Claude-ordered decks are fixed in the curation prompt (`curate.ts`) and proven with `npm run eval:deck -- --ai`. Rule-ordered decks are fixed in `rank.ts`/`cuisines.ts` (use the `debug-deck` skill). Hard needs belong in the code safety net in `deck.ts`, not only in the prompt.
- New food words go in `cuisines.ts` (one source of truth for the parser and ranking) and get an eval case. Use the `add-food-word` skill.
- When changing the wish prompt, run `npm run eval:prefs` before and after and report both scores.
- Mobile-first UI. Test at phone width. Colors come from the theme tokens in `src/app/globals.css` (night, dusk, haze, lilac, chili, mango, mint, ink, paper).

## Gotchas

- Rooms freeze their deck when swiping starts. After changing ranking or search code, create a **new** room to see the effect.
- `openNow` is in the restaurant's local time. Testing at night from another time zone makes everything "closed". Ranking ignores open hours when most places are closed.
- Socket.IO must keep `destroyUpgrade: false`, or Next's hot-reload websocket gets killed and dev pages reload in a loop.
- The user is learning. Explain what you changed and why in plain language, and say which files to look at.
