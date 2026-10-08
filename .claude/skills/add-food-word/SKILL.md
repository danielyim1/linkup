---
name: add-food-word
description: Teach LinkUp a new cuisine, dish, or food mood (e.g. "Ukrainian", "birria", "cozy soup night") so wishes that mention it match the right restaurants. Use when a wish mentioning a food wasn't understood or matched the wrong places.
argument-hint: "<food word or phrase>"
---

# Add a food word: $ARGUMENTS

LinkUp's food vocabulary lives in one place: `src/server/ranking/cuisines.ts`. Both the keyword fallback parser and the ranking use it, so one edit teaches both.

## Steps

1. **Read `src/server/ranking/cuisines.ts`** and decide where "$ARGUMENTS" belongs:
   - `CUISINES`: a cuisine, region, or dish ("Ukrainian", "birria"). Its list = words that appear in restaurant names, Google types (`ukrainian_restaurant`), or descriptions.
   - `MOODS`: a feeling about food, not a cuisine ("spicy", "comfort food"). Its list = cuisines/dishes that usually satisfy it.
   - If it's a synonym of an existing entry, add it to that entry's list instead of creating a new one.
2. **Add the line.** Lowercase keys and terms. Keep terms specific enough not to match unrelated text (avoid 2–3 letter terms that appear inside other words).
3. **If it's a broad family**, also make sure the bigger family includes it (e.g. a new Asian cuisine goes into `asian` too).
4. **Add an eval case** in `scripts/eval-preferences.ts` under "Food moods and more cuisines", e.g. `{ wish: "craving $ARGUMENTS", expect: { cuisinesWanted: ["…"] } }`.
5. **Prove it:**
   ```bash
   npm run eval:prefs -- --basic
   npm run rank:demo -- "craving $ARGUMENTS"
   ```
   The demo catalog is small, so a niche cuisine may have no demo match. That's fine if the eval passes.
6. **Tell the user** which line you added and why, and remind them to start a new room to see it.
