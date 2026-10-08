import { PRICE_LABEL, type Restaurant } from "./types";

export function formatDistance(m: number): string {
  const mi = m / 1609.34;
  if (mi < 0.1) return `${Math.round(m * 3.281)} ft`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export function formatPrice(r: Pick<Restaurant, "priceLevel">) {
  return r.priceLevel ? PRICE_LABEL[r.priceLevel] : null;
}

export function formatCount(n: number | null) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function directionsUrl(r: Restaurant) {
  const params = new URLSearchParams({ api: "1", destination: `${r.lat},${r.lng}` });
  if (!r.id.startsWith("demo-")) {
    params.set("destination", r.name + (r.address ? `, ${r.address}` : ""));
    params.set("destination_place_id", r.id);
  }
  return `https://www.google.com/maps/dir/?${params}`;
}

export const MILES = [0.5, 1, 2, 5, 10] as const;
export const milesToMeters = (mi: number) => Math.round(mi * 1609.34);
