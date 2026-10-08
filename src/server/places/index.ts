import { DemoPlacesProvider } from "./demo";
import { GooglePlacesProvider } from "./google";
import type { PlacesProvider } from "./types";

let provider: PlacesProvider | undefined;

export function getPlacesProvider(): PlacesProvider {
  if (!provider) {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    provider = key ? new GooglePlacesProvider(key) : new DemoPlacesProvider();
  }
  return provider;
}

export function getGoogleProvider(): GooglePlacesProvider | null {
  const p = getPlacesProvider();
  return p instanceof GooglePlacesProvider ? p : null;
}

export type { PlacesProvider } from "./types";
