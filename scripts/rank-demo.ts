/**
 * See how the group's wishes change the deck, using demo restaurants (no API keys needed).
 *   npm run rank:demo
 *   npm run rank:demo -- "wish one" "wish two" ...
 *   npm run rank:demo -- --ai "wish one"      let Claude pick the deck (needs ANTHROPIC_API_KEY)
 */
import { parseWish } from "../src/server/ai/preferences";
import { DemoPlacesProvider } from "../src/server/places/demo";
import { mergeGroupPreferences } from "../src/server/ranking/group";
import { preferencesFromFilters, rankRestaurants } from "../src/server/ranking/rank";
import { buildDeck } from "../src/server/ranking/deck";

const wishes = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!wishes.length) {
  wishes.push(
    "I want somewhere casual and not too expensive where we can actually talk",
    "I'm vegetarian, no sushi please",
    "big group, maybe tacos?",
  );
}

const parsed: import("../src/lib/types").GuestPreferences[] = [];
for (const w of wishes) {
  const { prefs, source } = await parseWish(w);
  parsed.push(prefs);
  console.log(`[${source}] "${w}"\n        → ${JSON.stringify(prefs)}`);
}
const group = mergeGroupPreferences(parsed);
console.log(`\nGroup: ${group?.summary}   (extra search: ${group?.searchQuery ?? "none"})`);

const filters = { radiusMeters: 3200, priceLevels: [], cuisine: null };
const list = await new DemoPlacesProvider().search({ lat: 37.76, lng: -122.42, filters });
const plain = rankRestaurants(list, preferencesFromFilters(filters), 8);
console.log("\nTop 8 without wishes:");
plain.forEach((r, i) => console.log(`  ${i + 1}. ${r.restaurant.name}`));

const deck = await buildDeck({
  found: list,
  filters,
  group,
  wishes: wishes.map((w, i) => ({ text: w, summary: parsed[i].summary, prefs: parsed[i] })),
  groupSize: wishes.length,
  useAI: process.argv.includes("--ai"),
});
console.log(`\nTop 8 with wishes (${deck.curatedBy === "ai" ? `picked by Claude in ${((deck.aiMs ?? 0) / 1000).toFixed(1)}s` : `rules${deck.aiError ? `, Claude failed: ${deck.aiError}` : ""}`}):`);
deck.cards.slice(0, 8).forEach((r, i) =>
  console.log(
    `  ${i + 1}. ${r.name} (${r.cuisine}, ${"$".repeat(r.priceLevel ?? 0)})  ${r.aiReason ? `✨ ${r.aiReason}` : r.fit?.length ? "✨ " + r.fit.join(" · ") : ""}`,
  ),
);
