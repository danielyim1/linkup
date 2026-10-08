import type { PriceLevel, Restaurant } from "@/lib/types";
import { boundingBox, haversineMeters } from "./geo";
import type { GeoPoint, PlacesProvider, SearchRequest } from "./types";

const BASE = "https://places.googleapis.com/v1";

const PRICE_FROM_API: Record<string, PriceLevel | null> = {
  PRICE_LEVEL_FREE: null,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const PRICE_TO_API: Record<PriceLevel, string> = {
  1: "PRICE_LEVEL_INEXPENSIVE",
  2: "PRICE_LEVEL_MODERATE",
  3: "PRICE_LEVEL_EXPENSIVE",
  4: "PRICE_LEVEL_VERY_EXPENSIVE",
};

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.photos",
  "places.currentOpeningHours.openNow",
  "places.googleMapsUri",
  "places.editorialSummary",
  "places.businessStatus",
  "places.types",
  "places.goodForGroups",
  "places.goodForChildren",
  "places.outdoorSeating",
  "places.liveMusic",
  "places.reservable",
  "places.servesVegetarianFood",
  "places.servesCocktails",
  "places.servesWine",
  "places.servesBeer",
  "places.takeout",
  "nextPageToken",
].join(",");

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  photos?: { name: string }[];
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  editorialSummary?: { text: string };
  businessStatus?: string;
  types?: string[];
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

function cuisineFrom(p: GPlace): string | null {
  const label = p.primaryTypeDisplayName?.text;
  if (!label) return null;
  const cleaned = label.replace(/\s*(Restaurant|Shop|House)$/i, "").trim();
  return cleaned && cleaned.toLowerCase() !== "restaurant" ? cleaned : label;
}

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google" as const;
  constructor(private apiKey: string) {}

  private async post<T>(path: string, body: unknown, fieldMask: string): Promise<T> {
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Places ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    const data = await this.post<{ places?: GPlace[] }>(
      "places:searchText",
      { textQuery: query, pageSize: 1 },
      "places.location,places.formattedAddress,places.displayName",
    );
    const p = data.places?.[0];
    if (!p?.location) return null;
    return {
      lat: p.location.latitude,
      lng: p.location.longitude,
      label: p.displayName?.text ?? p.formattedAddress ?? query,
    };
  }

  async search({ lat, lng, filters, query }: SearchRequest): Promise<Restaurant[]> {
    const base = filters.cuisine ? `${filters.cuisine} restaurant` : "restaurant";
    // The room's cuisine filter always wins; AI query words are added around it.
    const textQuery = query ? (filters.cuisine ? `${query.replace(/\brestaurant$/, "")} ${base}`.trim() : query) : base;
    const body: Record<string, unknown> = {
      textQuery,
      includedType: "restaurant",
      pageSize: 20,
      locationRestriction: { rectangle: boundingBox(lat, lng, filters.radiusMeters) },
      rankPreference: "RELEVANCE",
    };
    if (filters.priceLevels.length) body.priceLevels = filters.priceLevels.map((p) => PRICE_TO_API[p]);

    const seen = new Map<string, GPlace>();
    let pageToken: string | undefined;
    // Two pages → up to 40 candidates; plenty for a night-out deck.
    for (let page = 0; page < 2; page++) {
      const data = await this.post<{ places?: GPlace[]; nextPageToken?: string }>(
        "places:searchText",
        pageToken ? { ...body, pageToken } : body,
        FIELDS,
      );
      for (const p of data.places ?? []) seen.set(p.id, p);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const out: Restaurant[] = [];
    for (const p of seen.values()) {
      if (!p.location || p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const distance = haversineMeters(lat, lng, p.location.latitude, p.location.longitude);
      if (distance > filters.radiusMeters * 1.05) continue; // rectangle corners → trim to circle
      out.push({
        id: p.id,
        name: p.displayName?.text ?? "Unnamed",
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        priceLevel: p.priceLevel ? PRICE_FROM_API[p.priceLevel] ?? null : null,
        cuisine: cuisineFrom(p),
        address: p.shortFormattedAddress ?? p.formattedAddress ?? null,
        lat: p.location.latitude,
        lng: p.location.longitude,
        distanceMeters: Math.round(distance),
        photos: (p.photos ?? []).slice(0, 4).map((ph) => `/api/photo?name=${encodeURIComponent(ph.name)}`),
        openNow: p.currentOpeningHours?.openNow ?? null,
        mapsUrl: p.googleMapsUri ?? null,
        summary: p.editorialSummary?.text ?? null,
        types: p.types ?? [],
        features: {
          goodForGroups: p.goodForGroups,
          goodForChildren: p.goodForChildren,
          outdoorSeating: p.outdoorSeating,
          liveMusic: p.liveMusic,
          reservable: p.reservable,
          servesVegetarianFood: p.servesVegetarianFood,
          servesCocktails: p.servesCocktails,
          servesWine: p.servesWine,
          servesBeer: p.servesBeer,
          takeout: p.takeout,
        },
      });
    }
    return out;
  }

  /** Resolve a photo resource name to a short-lived public URL (no API key in it). */
  async photoUrl(name: string, maxWidth: number): Promise<string | null> {
    const url = `${BASE}/${name}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { photoUri?: string };
    return data.photoUri ?? null;
  }
}
