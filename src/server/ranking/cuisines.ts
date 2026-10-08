/**
 * People talk about food at different levels of detail: "Asian", "Chinese", "dim sum",
 * or just "something spicy". Restaurants are labeled specifically ("chinese_restaurant",
 * "Ramen", "Handmade pasta, candlelit and cozy").
 *
 * This file maps what someone asks for to all the words that count as a match.
 * It's the single vocabulary shared by the keyword fallback parser and the ranking.
 *
 * To teach LinkUp a new food word: add a line below. Nothing else needs to change.
 */

// ---- Cuisines: regions → specific cuisines → signature dishes ----
const CUISINES: Record<string, string[]> = {
  // Asia
  asian: ["chinese", "japanese", "korean", "thai", "vietnamese", "taiwanese", "filipino", "malaysian", "indonesian", "burmese", "singaporean", "cantonese", "sichuan", "szechuan", "hunan", "dim sum", "dumpling", "hot pot", "ramen", "udon", "sushi", "izakaya", "pho", "banh mi", "bao", "noodle", "bibimbap", "kimchi", "asian", "pan-asian"],
  "east asian": ["chinese", "japanese", "korean", "taiwanese", "cantonese", "sichuan", "szechuan", "dim sum", "dumpling", "hot pot", "ramen", "sushi", "izakaya", "bao", "noodle"],
  "southeast asian": ["thai", "vietnamese", "filipino", "malaysian", "indonesian", "burmese", "singaporean", "laotian", "cambodian", "pho", "banh mi"],
  "south asian": ["indian", "pakistani", "nepalese", "nepali", "bangladeshi", "sri lankan", "himalayan", "curry", "tandoor", "biryani"],
  chinese: ["chinese", "cantonese", "sichuan", "szechuan", "hunan", "shanghai", "dim sum", "dumpling", "hot pot", "noodle", "peking"],
  japanese: ["japanese", "sushi", "ramen", "udon", "soba", "izakaya", "omakase", "yakitori", "tonkatsu", "teriyaki"],
  korean: ["korean", "bibimbap", "kimchi", "korean bbq", "kbbq", "bulgogi"],
  thai: ["thai", "pad thai", "curry"],
  vietnamese: ["vietnamese", "pho", "banh mi"],
  filipino: ["filipino", "adobo", "lechon"],
  indian: ["indian", "curry", "tandoor", "tandoori", "biryani", "masala", "dosa", "south asian"],
  himalayan: ["himalayan", "nepalese", "nepali", "tibetan", "momo"],

  // Americas
  latin: ["mexican", "taco", "taqueria", "peruvian", "colombian", "salvadoran", "cuban", "brazilian", "argentinian", "argentine", "venezuelan", "puerto rican", "dominican", "latin", "pupusa", "empanada", "arepa"],
  "latin american": ["mexican", "taco", "taqueria", "peruvian", "colombian", "salvadoran", "cuban", "brazilian", "argentinian", "venezuelan", "latin", "pupusa", "empanada", "arepa"],
  mexican: ["mexican", "taco", "taqueria", "burrito", "cantina", "tex-mex", "enchilada", "mole"],
  "tex-mex": ["tex-mex", "mexican", "fajita", "burrito", "nacho"],
  peruvian: ["peruvian", "ceviche", "pollo a la brasa", "rotisserie chicken"],
  brazilian: ["brazilian", "churrasco", "churrascaria"],
  caribbean: ["caribbean", "jamaican", "trinidadian", "haitian", "cuban", "puerto rican", "dominican", "jerk", "roti"],
  american: ["american", "burger", "diner", "barbecue", "bbq", "steakhouse", "southern", "grill", "wings", "sandwich"],
  southern: ["southern", "soul food", "cajun", "creole", "fried chicken", "biscuit", "barbecue", "bbq", "low country"],
  "soul food": ["soul food", "southern", "fried chicken", "collard"],
  cajun: ["cajun", "creole", "louisiana", "gumbo", "crawfish", "po'boy", "po boy"],
  hawaiian: ["hawaiian", "poke", "plate lunch", "musubi"],

  // Europe & Mediterranean
  european: ["italian", "french", "spanish", "portuguese", "greek", "german", "british", "irish", "polish", "european", "bistro"],
  italian: ["italian", "pasta", "pizza", "trattoria", "osteria", "risotto"],
  french: ["french", "bistro", "brasserie", "creperie", "crepe"],
  spanish: ["spanish", "tapas", "paella", "basque"],
  greek: ["greek", "gyro", "souvlaki", "mezze"],
  german: ["german", "beer garden", "biergarten", "schnitzel", "bratwurst"],
  british: ["british", "pub", "fish and chips", "gastropub"],
  mediterranean: ["mediterranean", "greek", "lebanese", "turkish", "israeli", "middle eastern", "falafel", "mezze", "hummus", "spanish"],
  "middle eastern": ["middle eastern", "lebanese", "turkish", "persian", "iranian", "israeli", "syrian", "afghan", "falafel", "shawarma", "kebab", "hummus"],
  persian: ["persian", "iranian", "kebab"],
  turkish: ["turkish", "kebab", "doner", "pide"],

  // Africa
  african: ["african", "ethiopian", "eritrean", "nigerian", "ghanaian", "senegalese", "moroccan", "somali", "kenyan", "south african", "injera", "jollof"],
  ethiopian: ["ethiopian", "eritrean", "injera"],
  "north african": ["moroccan", "tunisian", "algerian", "egyptian", "tagine", "couscous"],
  moroccan: ["moroccan", "tagine", "couscous"],

  // Dishes & formats
  pizza: ["pizza", "pizzeria", "slice"],
  pasta: ["pasta", "italian", "noodle"],
  noodles: ["noodle", "ramen", "pho", "udon", "soba", "pasta", "lo mein", "pad thai"],
  dumplings: ["dumpling", "dim sum", "bao", "momo", "gyoza", "pierogi", "xiao long bao"],
  burgers: ["burger"],
  tacos: ["taco", "taqueria", "mexican"],
  sushi: ["sushi", "omakase", "sashimi"],
  ramen: ["ramen"],
  pho: ["pho"],
  curry: ["curry", "indian", "thai", "japanese curry"],
  "hot pot": ["hot pot", "hotpot", "shabu"],
  "korean bbq": ["korean bbq", "kbbq", "korean", "grill-at-your-table"],
  bbq: ["barbecue", "bbq", "smokehouse", "brisket", "korean bbq"],
  barbecue: ["barbecue", "bbq", "smokehouse", "brisket"],
  steak: ["steak", "steakhouse", "chophouse"],
  seafood: ["seafood", "oyster", "fish", "crab", "lobster", "shrimp", "poke", "raw bar"],
  chicken: ["chicken", "wings", "rotisserie", "fried chicken", "peri-peri", "pollo"],
  "fried chicken": ["fried chicken", "chicken", "wings"],
  wings: ["wings", "chicken"],
  sandwiches: ["sandwich", "deli", "sub", "banh mi", "hoagie"],
  salad: ["salad", "bowl", "greens"],
  soup: ["soup", "pho", "ramen", "noodle", "hot pot", "chowder", "stew", "pozole"],
  brunch: ["brunch", "breakfast", "cafe", "diner", "pancake", "waffle"],
  breakfast: ["breakfast", "brunch", "diner", "bagel", "pancake", "cafe"],
  dessert: ["dessert", "ice cream", "bakery", "pastry", "gelato", "cake", "boba"],
  coffee: ["coffee", "cafe", "espresso"],
};

// ---- Food moods: how people describe what they want without naming a cuisine ----
const MOODS: Record<string, string[]> = {
  spicy: ["spicy", "sichuan", "szechuan", "hunan", "thai", "indian", "korean", "hot pot", "jerk", "cajun", "nashville", "mexican", "chili", "curry"],
  healthy: ["healthy", "salad", "poke", "bowl", "vegetarian", "vegan", "plant-based", "mediterranean", "greens", "juice", "grain", "seasonal"],
  "something light": ["salad", "poke", "sushi", "vietnamese", "pho", "mediterranean", "light", "fresh"],
  light: ["salad", "poke", "sushi", "vietnamese", "pho", "mediterranean", "light", "fresh"],
  "comfort food": ["comfort", "diner", "burger", "fried chicken", "pizza", "barbecue", "bbq", "southern", "ramen", "noodle", "soup", "pasta", "mac and cheese"],
  hearty: ["barbecue", "bbq", "steak", "burger", "southern", "german", "hearty", "stew", "brisket"],
  "street food": ["street food", "taco", "taqueria", "falafel", "banh mi", "food truck", "kebab", "shawarma", "empanada", "bao", "arepa", "dumpling"],
  "small plates": ["small plates", "tapas", "izakaya", "mezze", "dim sum", "shar"],
  tapas: ["tapas", "small plates", "spanish"],
  sharing: ["shar", "family-style", "platter", "tapas", "dim sum", "hot pot", "korean bbq", "mezze", "by the pound"],
  meaty: ["steak", "barbecue", "bbq", "brisket", "burger", "korean bbq", "churrasco", "kebab"],
  fusion: ["fusion", "modern", "contemporary"],
};

const FAMILIES: Record<string, string[]> = { ...CUISINES, ...MOODS };

const normalize = (s: string) => s.toLowerCase().replace(/\b(food|cuisine|restaurant|place|spot)s?\b/g, "").replace(/\s+/g, " ").trim();
const singular = (s: string) => (s.length > 3 ? s.replace(/(es|s)$/, "") : s);

function familyFor(key: string) {
  return FAMILIES[key] ?? FAMILIES[singular(key)] ?? FAMILIES[`${key}s`];
}

/** All search terms that count as a match for what someone asked for. */
export function cuisineTerms(asked: string): string[] {
  const key = normalize(asked);
  return [...new Set([singular(key), ...(familyFor(key) ?? [])].filter(Boolean))];
}

/** Is this a food mood (spicy, healthy…) rather than a cuisine? Used for nicer labels. */
export function isFoodMood(asked: string): boolean {
  const key = normalize(asked);
  return key in MOODS || singular(key) in MOODS;
}

/** Does this text (restaurant name/description/categories) match the requested cuisine or mood? */
export function matchesCuisine(text: string, asked: string): boolean {
  const t = ` ${text.toLowerCase().replace(/_/g, " ")} `;
  return cuisineTerms(asked).some((term) => new RegExp(`[^a-z]${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t));
}

/**
 * The closest broader cuisine, for when nothing matches exactly:
 * "sushi" → "japanese", "pho" → "vietnamese", "tacos" → "mexican".
 * Picks the smallest family that contains the word, i.e. the most specific relative.
 */
export function relatedCuisine(asked: string): string | null {
  const key = singular(normalize(asked));
  let best: [string, number] | null = null;
  for (const [family, terms] of Object.entries(CUISINES)) {
    if (family === key || singular(family) === key) continue;
    if (!terms.some((t) => t === key || singular(t) === key)) continue;
    if (!best || terms.length < best[1]) best = [family, terms.length];
  }
  return best?.[0] ?? null;
}

/** Every word the keyword fallback should listen for, Title Cased ("Comfort Food", "Hot Pot"). */
export const FOOD_WORDS: string[] = Object.keys(FAMILIES).map((k) => k.replace(/\b\w/g, (c) => c.toUpperCase()));
