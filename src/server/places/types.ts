import type { Restaurant, RoomFilters } from "@/lib/types";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface SearchRequest {
  lat: number;
  lng: number;
  filters: RoomFilters;
  /** Free-text search, e.g. "quiet casual Thai restaurant" from the group's AI preferences. */
  query?: string;
}

/**
 * A source of restaurants. Swap or compose implementations (Google, Yelp, a cached
 * index with embeddings, …) without touching room logic.
 */
export interface PlacesProvider {
  readonly name: "google" | "demo";
  geocode(query: string): Promise<GeoPoint | null>;
  search(req: SearchRequest): Promise<Restaurant[]>;
}
