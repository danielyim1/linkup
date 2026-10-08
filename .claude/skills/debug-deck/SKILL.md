---
name: debug-deck
description: Explain why a LinkUp room's restaurant deck came out the way it did, with a point-by-point score breakdown per restaurant. Use when the user says a card shouldn't be there, the order looks wrong, wishes were ignored, or asks "why did X show up?".
argument-hint: "[room code] [restaurant name]"
allowed-tools: Bash(npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts *), Read, Grep
---

# Debug a LinkUp deck

The deck is built in `startRoom` (src/server/services/rooms.ts): search Google → merge everyone's wishes (src/server/ranking/group.ts) → score each place (src/server/ranking/rank.ts) → keep the top 30. Scoring is plain code, so every point can be explained.

## Steps

1. **Get the facts, don't guess.** Run the report for the room (default: the latest room):
   ```bash
   npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts $ARGUMENTS
   ```
   - No arguments → latest room. `--list` → recent rooms with their codes.
   - Add a restaurant name after the code to see just that card, e.g. `ABCDE sushi`.
   - If the user also pasted the `[deck CODE]` lines from the server's terminal, use them: they show the full search pool (how many $…$$$$ places Google returned) that the database doesn't keep.

2. **Read the breakdown.** Each card lists every line that added or removed points, biggest first. Typical culprits:
   - Wish not saved → "People and wishes" shows `(no wish)`. The user typed but didn't press "Tell the group".
   - Parsed wrong → the `→ summary` doesn't match what they meant. That's the AI/keyword parser (src/server/ai/preferences.ts). Add an eval case.
   - Pool problem → the deck has no places of the wanted price/cuisine at all. The search, not the scoring, is the issue (room hard filters, radius, or Google returned few). Check the room's hard filters first.
   - Weighting → the right places are in the deck but outranked. Compare the breakdown lines of the two cards.
   - "price unknown (no effect)" → Google has no price for that place.
   - Open hours → if it's late where the restaurants are, everything is closed; the report says whether open hours were ignored.

3. **Reproduce without the database** before changing code: `npm run rank:demo -- "<the wish>"`.

4. **Fix the smallest thing**, then prove it: re-run `rank:demo`, `npm run eval:prefs -- --basic`, and `npm run typecheck`. Remind the user that existing rooms keep their old deck. They need a new room to see the change.

5. **Explain to the user in plain words**: the root cause (one sentence), what you changed, and which file to look at.
