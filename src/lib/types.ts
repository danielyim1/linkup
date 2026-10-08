// Types shared between the server and the browser.
// Anything sent over the wire lives here so both sides agree on the shape.

export type PriceLevel = 1 | 2 | 3 | 4;

export interface RoomFilters {
  radiusMeters: number;
  priceLevels: PriceLevel[]; // empty = any price
  cuisine: string | null;
}

export interface Restaurant {
  id: string; // provider place id
  name: string;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: PriceLevel | null;
  cuisine: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  photos: string[]; // URLs the browser can load directly (proxied for Google)
  openNow: boolean | null;
  mapsUrl: string | null;
  summary: string | null;
  /** Demo restaurants have no photos; the UI renders an illustrated card instead. */
  emoji?: string;
  /** Provider category tags, e.g. ["bar", "thai_restaurant"]. Used for vibe matching. */
  types?: string[];
  /** Amenities the provider knows about (undefined = unknown). */
  features?: RestaurantFeatures;
  /** Why this place fits the group's stated preferences, e.g. ["Quiet", "Fits budget"]. Set at ranking time. */
  fit?: string[];
  /** Claude's one-line reason this place suits the group, when Claude curated the deck. */
  aiReason?: string;
}

export interface RestaurantFeatures {
  goodForGroups?: boolean;
  goodForChildren?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  reservable?: boolean;
  servesVegetarianFood?: boolean;
  servesCocktails?: boolean;
  servesWine?: boolean;
  servesBeer?: boolean;
  takeout?: boolean;
}

// ---- AI preferences ----

export const VIBES = [
  "casual",
  "upscale",
  "quiet",
  "lively",
  "romantic",
  "cozy",
  "trendy",
  "family_friendly",
  "good_for_groups",
  "outdoor_seating",
  "quick_bite",
  "late_night",
  "good_drinks",
] as const;
export type Vibe = (typeof VIBES)[number];

export const DIETARY = ["vegetarian", "vegan", "gluten_free", "halal", "kosher"] as const;
export type Dietary = (typeof DIETARY)[number];

/** One person's wish, turned into structure. Produced by the AI parser (or the keyword fallback). */
export interface GuestPreferences {
  summary: string; // short, human-readable: "casual, cheap, quiet"
  priceLevels: PriceLevel[]; // [] = no opinion
  cuisinesWanted: string[];
  cuisinesAvoid: string[];
  vibes: Vibe[];
  avoidVibes: Vibe[];
  dietary: Dietary[];
  openNowOnly: boolean;
}

export type RoomStatus = "lobby" | "swiping";

export interface Participant {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  online: boolean;
  swipedCount: number;
  wish: string | null; // what they typed, e.g. "somewhere we can actually talk"
  wishPrefs: GuestPreferences | null; // the structured version
}

export interface MatchInfo {
  restaurantId: string;
  likes: number;
  matchedAt: string;
}

/** Full room snapshot sent to one participant. Contains only *their* votes. */
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  locationLabel: string;
  filters: RoomFilters;
  provider: "google" | "demo";
  participants: Participant[];
  restaurants: Restaurant[];
  myVotes: Record<string, boolean>; // restaurantId -> liked
  matches: MatchInfo[];
  likesNeeded: number;
  /** Aggregate like counts, only revealed once everyone has finished swiping. */
  finalTally: Record<string, number> | null;
  /** "llm" when an AI model reads wishes; "basic" when falling back to keyword matching. */
  aiMode: "llm" | "basic";
  /** Merged group preference summary the deck was ranked with, e.g. "casual · $–$$ · quiet". */
  groupVibe: string | null;
  /** Who ordered the deck: Claude ("ai") or the rule-based ranker ("rules"). Null before start. */
  curatedBy: "ai" | "rules" | null;
}

// ---- Socket events ----

export interface ClientToServer {
  "room:join": (p: { code: string; participantId: string; token: string }, ack: (r: { ok: true } | { ok: false; error: string }) => void) => void;
  "room:ready": (p: { ready: boolean }) => void;
  "room:start": () => void;
  "wish:set": (p: { text: string }, ack: (r: { ok: true; prefs: GuestPreferences | null } | { ok: false; error: string }) => void) => void;
  "vote:cast": (p: { restaurantId: string; liked: boolean }, ack: (r: { ok: boolean; error?: string }) => void) => void;
}

export interface ServerToClient {
  "room:snapshot": (s: RoomSnapshot) => void;
  "room:participants": (p: { participants: Participant[]; likesNeeded: number }) => void;
  "room:starting": () => void;
  "room:error": (p: { message: string }) => void;
  "match:new": (m: MatchInfo) => void;
  "room:tally": (t: Record<string, number>) => void;
}

export const PRICE_LABEL: Record<PriceLevel, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
