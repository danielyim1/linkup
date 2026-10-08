import { PRICE_LABEL, type Dietary, type GuestPreferences, type PriceLevel, type Vibe } from "@/lib/types";

/**
 * Everyone's individual wishes, merged into one set of soft preferences for the group.
 * Weights are fractions of the people who expressed a wish, so one loud voice in a
 * group of six counts less than three people asking for the same thing.
 */
export interface GroupPreferences {
  voices: number; // how many people gave a wish
  priceLevels: PriceLevel[]; // soft budget; [] = no opinion
  cuisineWeights: Record<string, number>; // 0..1, share of people who asked for it
  cuisinesAvoid: string[]; // anyone's "no sushi" is respected
  vibeWeights: Partial<Record<Vibe, number>>; // -1..1 (wanted share minus avoid share)
  dietary: Dietary[]; // anyone's need applies to the whole group
  openNowOnly: boolean;
  summary: string; // "quiet · casual · $–$$"
  searchQuery: string | null; // extra query to send to the places API
}

const VIBE_LABEL: Record<Vibe, string> = {
  casual: "casual",
  upscale: "upscale",
  quiet: "quiet",
  lively: "lively",
  romantic: "romantic",
  cozy: "cozy",
  trendy: "trendy",
  family_friendly: "family-friendly",
  good_for_groups: "good for groups",
  outdoor_seating: "outdoor seating",
  quick_bite: "quick bite",
  late_night: "late night",
  good_drinks: "good drinks",
};

export function mergeGroupPreferences(all: GuestPreferences[]): GroupPreferences | null {
  const prefs = all.filter((p) => p.summary !== "no preference" || p.vibes.length || p.cuisinesWanted.length || p.priceLevels.length);
  if (!prefs.length) return null;
  const n = prefs.length;

  // Budget: the price levels acceptable to everyone who mentioned price.
  // If they don't overlap at all, fall back to anything anyone said.
  const priced = prefs.filter((p) => p.priceLevels.length);
  let priceLevels: PriceLevel[] = [];
  if (priced.length) {
    const common = ([1, 2, 3, 4] as PriceLevel[]).filter((l) => priced.every((p) => p.priceLevels.includes(l)));
    priceLevels = common.length ? common : [...new Set(priced.flatMap((p) => p.priceLevels))].sort();
  }

  const cuisineWeights: Record<string, number> = {};
  for (const p of prefs) for (const c of p.cuisinesWanted) cuisineWeights[c] = (cuisineWeights[c] ?? 0) + 1 / n;

  const vibeWeights: Partial<Record<Vibe, number>> = {};
  for (const p of prefs) {
    for (const v of p.vibes) vibeWeights[v] = (vibeWeights[v] ?? 0) + 1 / n;
    for (const v of p.avoidVibes) vibeWeights[v] = (vibeWeights[v] ?? 0) - 1 / n;
  }

  const cuisinesAvoid = [...new Set(prefs.flatMap((p) => p.cuisinesAvoid))];
  const dietary = [...new Set(prefs.flatMap((p) => p.dietary))];
  const openNowOnly = prefs.some((p) => p.openNowOnly);

  const topVibes = (Object.entries(vibeWeights) as [Vibe, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([v]) => v);
  const topCuisines = Object.entries(cuisineWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c);

  const priceText = priceLevels.length
    ? priceLevels.length === 1
      ? PRICE_LABEL[priceLevels[0]]
      : `${PRICE_LABEL[priceLevels[0]]}–${PRICE_LABEL[priceLevels[priceLevels.length - 1]]}`
    : null;
  const summaryParts = [
    ...topVibes.map((v) => VIBE_LABEL[v]),
    ...topCuisines.map((c) => c.toLowerCase()),
    ...dietary.map((d) => d.replace("_", "-")),
    ...(priceText ? [priceText] : []),
  ].slice(0, 5);

  // A natural-language query for the places API, e.g. "quiet casual Thai restaurant".
  // Only include things a majority of voices asked for so we don't over-narrow.
  const queryVibes = topVibes.filter((v) => (vibeWeights[v] ?? 0) >= 0.5 && v !== "good_for_groups");
  const queryCuisine = topCuisines.find((c) => (cuisineWeights[c] ?? 0) >= 0.5);
  const queryDiet = dietary.find((d) => d === "vegetarian" || d === "vegan");
  const queryParts = [...queryVibes.map((v) => VIBE_LABEL[v]), queryDiet, queryCuisine].filter(Boolean);
  const searchQuery = queryParts.length ? `${queryParts.join(" ")} restaurant` : null;

  return {
    voices: n,
    priceLevels,
    cuisineWeights,
    cuisinesAvoid,
    vibeWeights,
    dietary,
    openNowOnly,
    summary: summaryParts.join(" · ") || "no strong preference",
    searchQuery,
  };
}
