/**
 * Build a room's deck from the places a search found.
 * One function used by the app (startRoom), the demo script, and the deck eval,
 * so what we measure is exactly what friends see.
 *
 *   1. Rules pre-sort everything (rank.ts): quality, distance, hours, wishes.
 *   2. If anyone made a wish and Claude is available, Claude picks and orders the
 *      best of the top 40 and writes a reason for each (ai/curate.ts).
 *   3. The deck is Claude's picks first, then the remaining rule-ordered places,
 *      so there are always enough cards. On any AI problem, the rule order is used.
 *   4. Guarantees (code, not model judgment), applied to either order:
 *      - nothing that clashes with a refused cuisine or a dietary need leads the deck
 *      - if most of the group named a cuisine, matching places come first
 *      - everyone who named a cuisine or price gets at least one option in the top 5
 */
import type { GuestPreferences, Restaurant, RoomFilters } from "@/lib/types";
import { curateDeck, type Wish } from "@/server/ai/curate";
export type { Wish };
import { getClaude } from "@/server/ai/client";
import type { GroupPreferences } from "./group";
import { matchesCuisine, relatedCuisine } from "./cuisines";
import { dietaryMatch, preferencesFromFilters, rankRestaurants } from "./rank";

export const DECK_SIZE = 30;

export interface DeckResult {
  cards: Restaurant[]; // in deck order, with fit (rule reasons) and aiReason (Claude) filled in
  scores: Map<string, number>; // rule-based score per place id (kept for debugging)
  curatedBy: "ai" | "rules";
  aiMs?: number;
  aiError?: string;
}

export function describeFilters(f: RoomFilters): string {
  const price = f.priceLevels.length ? f.priceLevels.map((l) => "$".repeat(l)).join(", ") : "any";
  return `price: ${price}, cuisine: ${f.cuisine ?? "any"}, within ${(f.radiusMeters / 1609.34).toFixed(1)} mi`;
}

export async function buildDeck(opts: {
  found: Restaurant[];
  filters: RoomFilters;
  group: GroupPreferences | null;
  wishes: Wish[];
  groupSize: number;
  useAI?: boolean; // default: use Claude when a key is configured
}): Promise<DeckResult> {
  const { found, filters, group, wishes, groupSize } = opts;
  const ruled = rankRestaurants(found, preferencesFromFilters(filters, group), 60);
  const scores = new Map(ruled.map((r) => [r.restaurant.id, r.score]));
  const withFit = (x: (typeof ruled)[number]): Restaurant => (x.reasons.length ? { ...x.restaurant, fit: x.reasons } : x.restaurant);
  const rulesDeck = applyGuarantees(ruled.map(withFit), group, wishes).slice(0, DECK_SIZE);

  const useAI = opts.useAI ?? Boolean(getClaude());
  if (!useAI || !wishes.length) return { cards: rulesDeck, scores, curatedBy: "rules" };

  try {
    const result = await curateDeck({
      candidates: ruled.map((r) => r.restaurant),
      wishes,
      groupSize,
      roomFilters: describeFilters(filters),
    });
    if (!result) return { cards: rulesDeck, scores, curatedBy: "rules" };

    const pickedIds = new Set(result.picks.map((p) => p.restaurant.id));
    const fitById = new Map(ruled.map((x) => [x.restaurant.id, x.reasons]));
    const ordered: Restaurant[] = [
      ...result.picks.map((p) => ({ ...p.restaurant, fit: fitById.get(p.restaurant.id), aiReason: p.reason || undefined })),
      ...ruled.filter((x) => !pickedIds.has(x.restaurant.id)).map(withFit),
    ];
    const cards = applyGuarantees(ordered, group, wishes).slice(0, DECK_SIZE);
    return { cards, scores, curatedBy: "ai", aiMs: result.ms };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[ai] deck curation failed, using rule order: ${msg}`);
    return { cards: rulesDeck, scores, curatedBy: "rules", aiError: msg };
  }
}

// ---------------------------------------------------------------------------
// Guarantees: promises the app makes no matter who ordered the deck.
// ---------------------------------------------------------------------------

const textOf = (r: Restaurant) => [r.name, r.cuisine, ...(r.types ?? [])].join(" ");
const TOP = 5;

/** Does this place clash with a hard need of the group (refused cuisine, dietary)? */
export function clashes(r: Restaurant, group: GroupPreferences | null): boolean {
  if (!group) return false;
  return (
    group.cuisinesAvoid.some((c) => matchesCuisine(textOf(r), c)) || group.dietary.some((d) => dietaryMatch(r, d) <= -0.8)
  );
}

/** Would this person be happy to see this card? (Only judged on what they explicitly asked for.) */
function satisfies(r: Restaurant, p: GuestPreferences, needPrice: boolean, related = false): boolean {
  const cuisineOk =
    !p.cuisinesWanted.length ||
    p.cuisinesWanted.some((c) => matchesCuisine(textOf(r), c) || (related && !!relatedCuisine(c) && matchesCuisine(textOf(r), relatedCuisine(c)!)));
  const priceOk = !needPrice || !p.priceLevels.length || (r.priceLevel != null && p.priceLevels.includes(r.priceLevel));
  const dietOk = p.dietary.every((d) => dietaryMatch(r, d) > 0.4);
  return cuisineOk && priceOk && dietOk;
}

export function applyGuarantees(cards: Restaurant[], group: GroupPreferences | null, wishes: Wish[]): Restaurant[] {
  // 1. Hard needs: clashing places move to the back (kept, so the deck stays full).
  let out = [...cards.filter((r) => !clashes(r, group)), ...cards.filter((r) => clashes(r, group))];

  // 2. Cuisine first: if most people who made a wish named a cuisine, matching places lead.
  const wanted = Object.entries(group?.cuisineWeights ?? {});
  if (wanted.length && Math.max(...wanted.map(([, w]) => w)) >= 0.5) {
    const hit = (r: Restaurant) => wanted.some(([c]) => matchesCuisine(textOf(r), c));
    out = [...out.filter((r) => hit(r) && !clashes(r, group)), ...out.filter((r) => !(hit(r) && !clashes(r, group)))];
  }

  // 3. Fairness: everyone who asked for a cuisine, price or diet sees at least one option in the top 5.
  let slot = TOP - 1;
  for (const w of wishes) {
    const p = w.prefs;
    if (!p || (!p.cuisinesWanted.length && !p.priceLevels.length && !p.dietary.length) || slot < 1) continue;
    const top = out.slice(0, TOP);
    if (top.some((r) => satisfies(r, p, true))) continue;
    // Best match outside the top 5: exact first, then ignoring price, then the closest related
    // cuisine (no sushi place works for the group → a Japanese place).
    const rest = out.slice(TOP).filter((r) => !clashes(r, group));
    const rescue =
      rest.find((r) => satisfies(r, p, true)) ??
      rest.find((r) => satisfies(r, p, false)) ??
      rest.find((r) => satisfies(r, p, false, true));
    if (!rescue) continue;
    out = out.filter((r) => r !== rescue);
    out.splice(slot, 0, rescue);
    slot -= 1; // the next rescued card goes one slot higher, so it doesn't push this one out
  }
  return out;
}
