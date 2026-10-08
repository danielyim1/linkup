import type { Dietary, Restaurant, RoomFilters, Vibe } from "@/lib/types";
import type { GroupPreferences } from "./group";
import { isFoodMood, matchesCuisine } from "./cuisines";

/**
 * Everything ranking knows about what the group wants:
 * hard-ish filters from the room setup, plus soft AI-derived group preferences.
 */
export interface Preferences {
  radiusMeters: number;
  priceLevels: number[];
  cuisine: string | null;
  group: GroupPreferences | null;
  /** Set when most places are closed (late night, or planning ahead): don't punish "closed now". */
  ignoreOpenNow?: boolean;
}

export function preferencesFromFilters(f: RoomFilters, group: GroupPreferences | null = null): Preferences {
  return { radiusMeters: f.radiusMeters, priceLevels: f.priceLevels, cuisine: f.cuisine, group };
}

export interface Ranked {
  restaurant: Restaurant;
  score: number;
  reasons: string[]; // human-readable "why it fits", strongest first
}

// ---------------------------------------------------------------------------
// How well does a restaurant match a vibe? Returns -1..1, or 0 when we can't tell.
// Combines structured provider data (features, types, price) with words in its
// name/description. This is the part embeddings could replace later.
// ---------------------------------------------------------------------------

function textOf(r: Restaurant) {
  return [r.name, r.summary, r.cuisine, ...(r.types ?? [])].filter(Boolean).join(" ").toLowerCase();
}
const has = (text: string, re: RegExp) => re.test(text);
const typeIs = (r: Restaurant, ...ts: string[]) => (r.types ?? []).some((t) => ts.includes(t));

export function vibeMatch(r: Restaurant, vibe: Vibe): number {
  const t = textOf(r);
  const f = r.features ?? {};
  const p = r.priceLevel;
  const barish = typeIs(r, "bar", "night_club", "pub", "sports_bar", "wine_bar", "cocktail_bar") || has(t, /\b(bar|pub|jukebox|sports)\b/);
  switch (vibe) {
    case "casual":
      if (p === 1 || typeIs(r, "fast_food_restaurant", "pizza_restaurant", "cafe", "sandwich_shop")) return 1;
      if (p === 2) return 0.5;
      if (p && p >= 3) return -1;
      return 0;
    case "upscale":
      if (p === 4) return 1;
      if (p === 3) return 0.7;
      if (p === 1) return -1;
      return has(t, /\b(fine dining|tasting menu|chef'?s|omakase|elegant)\b/) ? 1 : 0;
    case "quiet": {
      let s = 0;
      if (f.liveMusic === true || barish || has(t, /\b(loud|lively|bustling|party|karaoke|jukebox)\b/)) s -= 1;
      if (has(t, /\b(quiet|calm|intimate|relaxed|cozy|cosy|tea|back room)\b/)) s += 1;
      if (typeIs(r, "cafe", "tea_house")) s += 0.5;
      if (typeIs(r, "fast_food_restaurant")) s -= 0.5;
      return Math.max(-1, Math.min(1, s));
    }
    case "lively": {
      let s = 0;
      if (f.liveMusic === true) s += 1;
      if (barish || has(t, /\b(lively|bustling|party|buzzing|loud|margarita|karaoke)\b/)) s += 0.8;
      if (has(t, /\b(quiet|intimate|calm)\b/)) s -= 0.7;
      return Math.max(-1, Math.min(1, s));
    }
    case "romantic":
      if (has(t, /\b(romantic|intimate|candle|candlelit|date night|wine bar)\b/)) return 1;
      if (typeIs(r, "fast_food_restaurant")) return -1;
      return p && p >= 3 ? 0.5 : 0;
    case "cozy":
      return has(t, /\b(cozy|cosy|intimate|warm|candlelit|neighborhood|small)\b/) ? 1 : 0;
    case "trendy":
      return has(t, /\b(trendy|hip|stylish|modern|natural wine|new)\b/) ? 1 : 0;
    case "family_friendly":
      if (f.goodForChildren === true) return 1;
      if (barish) return -1;
      if (f.goodForChildren === false) return -0.6;
      return has(t, /\b(family|kids)\b/) ? 0.8 : 0;
    case "good_for_groups":
      if (f.goodForGroups === true) return 1;
      if (has(t, /\b(shar(e|ing)|long tables|big (round )?tables|platters?|family[- ]style|booths?|groups?|grill-at-your-table|by the pound)\b/)) return 0.8;
      if (f.goodForGroups === false) return -0.7;
      return 0;
    case "outdoor_seating":
      if (f.outdoorSeating === true || has(t, /\b(patio|terrace|garden|outdoor|rooftop|picnic)\b/)) return 1;
      if (f.outdoorSeating === false) return -1;
      return 0;
    case "quick_bite":
      if (typeIs(r, "fast_food_restaurant", "meal_takeaway", "sandwich_shop") || has(t, /\b(quick|fast|counter|window|slices?)\b/)) return 1;
      if (p && p >= 3) return -1;
      return f.takeout ? 0.4 : 0;
    case "late_night":
      return has(t, /\b(late[- ]night|late|after 9|open late|midnight)\b/) ? 1 : 0;
    case "good_drinks":
      if (f.servesCocktails || has(t, /\b(cocktails?|margaritas?|sake|natural wine|wine bar|craft beer)\b/)) return 1;
      if (f.servesWine || f.servesBeer || barish) return 0.6;
      return 0;
  }
}

export function dietaryMatch(r: Restaurant, d: Dietary): number {
  const t = textOf(r);
  const f = r.features ?? {};
  switch (d) {
    case "vegetarian":
      if (has(t, /\b(vegetarian|vegan|veggie|plant[- ]based)\b/)) return 1;
      if (f.servesVegetarianFood === true) return 0.8;
      if (f.servesVegetarianFood === false) return -1;
      if (has(t, /\b(indian|ethiopian|middle eastern|falafel|mediterranean|thai)\b/)) return 0.5;
      if (has(t, /\b(steak|steakhouse|bbq|barbecue|brisket|oyster|seafood)\b/)) return -0.8;
      return 0;
    case "vegan":
      if (has(t, /\b(vegan|plant[- ]based)\b/)) return 1;
      if (has(t, /\b(vegetarian|veggie)\b/) || f.servesVegetarianFood) return 0.4;
      if (has(t, /\b(steak|steakhouse|bbq|barbecue|brisket|oyster|seafood|cheese)\b/)) return -1;
      return 0;
    case "gluten_free":
      return has(t, /\b(gluten[- ]free|celiac)\b/) ? 1 : 0;
    case "halal":
      return has(t, /\bhalal\b/) ? 1 : has(t, /\b(middle eastern|falafel|turkish|pakistani)\b/) ? 0.5 : 0;
    case "kosher":
      return has(t, /\bkosher\b/) ? 1 : 0;
  }
}

const VIBE_REASON: Record<Vibe, string> = {
  casual: "Casual",
  upscale: "Upscale",
  quiet: "Easy to talk",
  lively: "Lively",
  romantic: "Date-worthy",
  cozy: "Cozy",
  trendy: "Trendy",
  family_friendly: "Kid-friendly",
  good_for_groups: "Good for groups",
  outdoor_seating: "Outdoor seating",
  quick_bite: "Quick",
  late_night: "Late-night",
  good_drinks: "Good drinks",
};
const DIET_REASON: Record<Dietary, string> = {
  vegetarian: "Veggie-friendly",
  vegan: "Vegan options",
  gluten_free: "Gluten-free options",
  halal: "Halal",
  kosher: "Kosher",
};

const cuisineHit = (r: Restaurant, c: string) => matchesCuisine(textOf(r), c);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** A line in a score breakdown, e.g. ["rating 4.6 (812 reviews)", 2.1]. */
export type ScorePart = [label: string, points: number];

/** Baseline: quality (rating shrunk toward a prior), proximity, open now, room cuisine. */
function baseScore(r: Restaurant, prefs: Preferences, parts: ScorePart[]): number {
  let score = 0;
  const add = (label: string, n: number) => {
    score += n;
    if (n !== 0) parts.push([label, n]);
  };
  const prior = 4.0;
  const n = r.ratingCount ?? 0;
  const rating = r.rating ?? prior;
  const quality = (rating * n + prior * 50) / (n + 50);
  add(`rating ${r.rating ?? "none"} (${n} reviews)`, (quality - 3.5) * 2);
  add(`distance ${Math.round(r.distanceMeters)}m`, (1 - Math.min(1, r.distanceMeters / Math.max(prefs.radiusMeters, 1))) * 1.2);
  if (!prefs.ignoreOpenNow) {
    if (r.openNow === true) add("open now", 0.6);
    if (r.openNow === false) add("closed now", -2.5);
  }
  if (prefs.cuisine && r.cuisine?.toLowerCase().includes(prefs.cuisine.toLowerCase())) add(`room cuisine ${prefs.cuisine}`, 0.8);
  if (r.photos.length === 0 && !r.emoji) add("no photos", -0.5);
  return score;
}

/** Soft bonus/penalty from the group's stated wishes, with the reasons that earned the bonus. */
function groupScore(r: Restaurant, g: GroupPreferences, parts: ScorePart[]): { score: number; reasons: [string, number][] } {
  let score = 0;
  const reasons: [string, number][] = [];
  const add = (label: string, n: number) => {
    score += n;
    if (Math.abs(n) > 0.001) parts.push([label, n]);
  };

  for (const [vibe, weight] of Object.entries(g.vibeWeights) as [Vibe, number][]) {
    const m = vibeMatch(r, vibe);
    const contribution = 1.6 * weight * m;
    add(`vibe ${vibe} (wanted ${weight.toFixed(2)}, match ${m.toFixed(1)})`, contribution);
    if (weight > 0 && m > 0.4) reasons.push([VIBE_REASON[vibe], contribution]);
  }

  // Cuisine: a clear request should move the deck, not just nudge it.
  // Matches get a bonus scaled by how many people asked; if most of the group asked for
  // a cuisine, places that match none of the requested cuisines are pushed down.
  const cuisines = Object.entries(g.cuisineWeights);
  let matchedCuisine = false;
  for (const [c, weight] of cuisines) {
    if (cuisineHit(r, c)) {
      matchedCuisine = true;
      add(`cuisine match "${c}"`, 3 * weight);
      // "Spicy" reads better than "Indian" when someone asked for spicy.
      const label = isFoodMood(c) ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : (r.cuisine ?? c);
      reasons.push([label, 3 * weight + 0.01]);
    }
  }
  const strongest = Math.max(0, ...cuisines.map(([, w]) => w));
  // A named cuisine beats price: this penalty is bigger than being 2 price levels off,
  // so a $$ Asian place outranks $$$$ Italian for "expensive asian food".
  if (!matchedCuisine && strongest >= 0.5) add(`no match for wanted cuisines (${cuisines.map(([c]) => c).join(", ")})`, -3 * strongest);
  const avoided = g.cuisinesAvoid.find((c) => cuisineHit(r, c));
  if (avoided) add(`someone said no ${avoided}`, -4);

  for (const d of g.dietary) {
    const m = dietaryMatch(r, d);
    add(`dietary ${d} (match ${m.toFixed(1)})`, m >= 0 ? 1.2 * m : 3 * m); // a bad fit hurts more than a good fit helps
    if (m > 0.4) reasons.push([DIET_REASON[d], 1.2 * m]);
  }

  // Price: inside the budget earns a bonus. Over budget hurts more than under —
  // a cheaper place is usually fine, a pricier one usually isn't.
  if (g.priceLevels.length && r.priceLevel) {
    const max = Math.max(...g.priceLevels);
    const min = Math.min(...g.priceLevels);
    const want = g.priceLevels.map((l) => "$".repeat(l)).join("/");
    if (g.priceLevels.includes(r.priceLevel)) {
      add(`price ${"$".repeat(r.priceLevel)} within ${want}`, 1.2);
      reasons.push([max <= 2 ? "Fits budget" : max >= 3 && min >= 3 ? "Worth the splurge" : "Right price", 0.5]);
    } else if (r.priceLevel > max) {
      add(`price ${"$".repeat(r.priceLevel)} over ${want}`, -1.8 * (r.priceLevel - max));
    } else {
      // Cheaper than asked. Fine for a budget group, but if they asked for upscale ($$$+),
      // a $ place is just as wrong as an over-budget one.
      add(`price ${"$".repeat(r.priceLevel)} under ${want}`, -(min >= 3 ? 1.8 : 0.7) * (min - r.priceLevel));
    }
  } else if (g.priceLevels.length) {
    parts.push(["price unknown (no effect)", 0]);
  }

  if (g.openNowOnly && r.openNow === false) add("closed, but someone wants to go now", -4);

  return { score, reasons };
}

export function scoreRestaurant(r: Restaurant, prefs: Preferences): { score: number; reasons: string[] } {
  const { score, reasons } = explainScore(r, prefs);
  return { score, reasons };
}

/** Same as scoreRestaurant, plus every line that added or removed points. */
export function explainScore(r: Restaurant, prefs: Preferences): { score: number; reasons: string[]; parts: ScorePart[] } {
  const parts: ScorePart[] = [];
  const base = baseScore(r, prefs, parts);
  if (!prefs.group) return { score: base, reasons: [], parts };
  const g = groupScore(r, prefs.group, parts);
  const reasons = [...new Map(g.reasons.sort((a, b) => b[1] - a[1]).map(([label, w]) => [label, w])).keys()].slice(0, 3);
  return { score: base + g.score, reasons, parts };
}

/** True when most places with known hours are closed, e.g. it's 1 AM where the group is. */
export function mostlyClosed(list: Restaurant[]): boolean {
  const known = list.filter((r) => r.openNow !== null);
  return known.length >= 5 && known.filter((r) => r.openNow === false).length / known.length >= 0.6;
}

export function rankRestaurants(list: Restaurant[], prefs: Preferences, limit = 30): Ranked[] {
  // If nearly everything is closed, the group is planning ahead — rank as if it's open hours.
  const p = prefs.ignoreOpenNow === undefined ? { ...prefs, ignoreOpenNow: mostlyClosed(list) } : prefs;
  return list
    .map((restaurant) => ({ restaurant, ...scoreRestaurant(restaurant, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
