import type { PriceLevel, Restaurant, RestaurantFeatures } from "@/lib/types";
import { haversineMeters, parseLatLng } from "./geo";
import type { GeoPoint, PlacesProvider, SearchRequest } from "./types";

// Used when no GOOGLE_PLACES_API_KEY is set, so the whole flow works out of the box.
const CATALOG: [string, string, string, PriceLevel, number, string][] = [
  ["Nonna's Table", "Italian", "🍝", 2, 4.6, "Handmade pasta, candlelit and cozy."],
  ["Slice Society", "Pizza", "🍕", 1, 4.4, "Thin-crust slices and a loud jukebox."],
  ["Ramen Kaze", "Ramen", "🍜", 2, 4.7, "Rich tonkotsu, short waits after 9pm."],
  ["Taqueria La Luz", "Mexican", "🌮", 1, 4.5, "Al pastor off the trompo, late-night window."],
  ["Seoul Fire BBQ", "Korean", "🥩", 3, 4.6, "Grill-at-your-table with endless banchan."],
  ["Golden Lotus", "Thai", "🍛", 2, 4.3, "Punchy curries and a great patio."],
  ["Sakura Omakase", "Sushi", "🍣", 4, 4.8, "Twelve-seat counter, chef's choice."],
  ["Burger Theory", "Burgers", "🍔", 1, 4.2, "Smash burgers and crinkle fries."],
  ["The Green Fork", "Vegetarian", "🥗", 2, 4.4, "Seasonal plates, natural wine."],
  ["Pho Saigon Corner", "Vietnamese", "🍲", 1, 4.5, "Big bowls, quick service."],
  ["Bombay Spice Room", "Indian", "🍛", 2, 4.6, "Tandoor, biryani and great lassi."],
  ["Le Petit Bistro", "French", "🥐", 3, 4.5, "Steak frites and a quiet back room."],
  ["Olive & Thyme", "Mediterranean", "🫒", 2, 4.4, "Mezze for sharing, long tables."],
  ["Dim Sum Palace", "Chinese", "🥟", 2, 4.3, "Carts all day, big round tables."],
  ["Smokestack BBQ", "Barbecue", "🍖", 2, 4.5, "Brisket by the pound, picnic benches."],
  ["Blue Agave Cantina", "Mexican", "🍹", 2, 4.1, "Margaritas, tacos and a lively bar."],
  ["Tokyo Izakaya", "Japanese", "🍶", 3, 4.6, "Skewers, sake and small plates."],
  ["Brooklyn Pie Co.", "Pizza", "🍕", 2, 4.5, "Wood-fired pies, big booths."],
  ["Mama Ethiopia", "Ethiopian", "🫓", 2, 4.7, "Shared platters on injera."],
  ["Harbor Oyster Bar", "Seafood", "🦪", 3, 4.6, "Oysters, chowder and a raw bar."],
  ["Café Lisboa", "Portuguese", "🐟", 2, 4.4, "Grilled sardines and custard tarts."],
  ["Bao Down", "Taiwanese", "🥟", 1, 4.3, "Fluffy bao and bubble tea."],
  ["The Gilded Steer", "Steakhouse", "🥩", 4, 4.5, "Dry-aged steaks, old-school service."],
  ["Falafel Republic", "Middle Eastern", "🧆", 1, 4.6, "Crispy falafel, fast and cheap."],
  ["Curry Up Now", "Indian", "🌯", 1, 4.2, "Indian street food, burritos and bowls."],
  ["Pasta Bar Trentuno", "Italian", "🍝", 3, 4.7, "Tasting menu of fresh pastas."],
  ["Kimchi Kitchen", "Korean", "🍚", 1, 4.4, "Bibimbap and fried chicken."],
  ["Noodle Lab", "Chinese", "🍜", 1, 4.5, "Hand-pulled noodles, chili oil."],
];

// Amenities for the demo catalog so AI preferences have something to match against.
// g=good for groups, k=kids, o=outdoor, m=live music, r=reservable, v=vegetarian, c=cocktails, w=wine, b=beer, t=takeout
const FEATURES: Record<string, string> = {
  "Nonna's Table": "rvw",
  "Slice Society": "gktb",
  "Ramen Kaze": "tb",
  "Taqueria La Luz": "gktvb",
  "Seoul Fire BBQ": "grb",
  "Golden Lotus": "ovtb",
  "Sakura Omakase": "rw",
  "Burger Theory": "gktb",
  "The Green Fork": "ovrw",
  "Pho Saigon Corner": "kt",
  "Bombay Spice Room": "gkvrt",
  "Le Petit Bistro": "rw",
  "Olive & Thyme": "govrw",
  "Dim Sum Palace": "gkvr",
  "Smokestack BBQ": "gkotb",
  "Blue Agave Cantina": "gmcb",
  "Tokyo Izakaya": "gvcwb", // izakayas usually have plenty of vegetable dishes
  "Brooklyn Pie Co.": "gkvtb",
  "Mama Ethiopia": "gvr",
  "Harbor Oyster Bar": "rcw",
  "Café Lisboa": "ovw",
  "Bao Down": "kt",
  "The Gilded Steer": "rcw",
  "Falafel Republic": "kvt",
  "Curry Up Now": "gkvtb",
  "Pasta Bar Trentuno": "rw",
  "Kimchi Kitchen": "kt",
  "Noodle Lab": "kvt",
};
function features(name: string): RestaurantFeatures {
  const f = FEATURES[name] ?? "";
  return {
    goodForGroups: f.includes("g"),
    goodForChildren: f.includes("k"),
    outdoorSeating: f.includes("o"),
    liveMusic: f.includes("m"),
    reservable: f.includes("r"),
    servesVegetarianFood: f.includes("v"),
    servesCocktails: f.includes("c"),
    servesWine: f.includes("w"),
    servesBeer: f.includes("b"),
    takeout: f.includes("t"),
  };
}
const BAR_LIKE = new Set(["Blue Agave Cantina", "Tokyo Izakaya", "Harbor Oyster Bar"]);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export class DemoPlacesProvider implements PlacesProvider {
  readonly name = "demo" as const;

  async geocode(query: string): Promise<GeoPoint | null> {
    const ll = parseLatLng(query);
    if (ll) return { ...ll, label: "Current location" };
    // Without a geocoder, place everything around downtown SF but keep the user's label.
    return { lat: 37.7749, lng: -122.4194, label: query.trim() || "San Francisco" };
  }

  async search({ lat, lng, filters }: SearchRequest): Promise<Restaurant[]> {
    const rand = rng(Math.floor(Math.abs(lat * 1000 + lng * 1000)) + 7);
    const all: Restaurant[] = CATALOG.map(([name, cuisine, emoji, price, rating, summary], i) => {
      const angle = rand() * Math.PI * 2;
      const dist = (0.1 + rand() * 0.85) * filters.radiusMeters;
      const pLat = lat + (dist * Math.cos(angle)) / 111320;
      const pLng = lng + (dist * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
      return {
        id: `demo-${i}`,
        name,
        rating,
        ratingCount: Math.floor(80 + rand() * 2400),
        priceLevel: price,
        cuisine,
        address: `${Math.floor(100 + rand() * 2800)} ${["Valencia", "Market", "Mission", "Divisadero", "Polk", "Fillmore"][i % 6]} St`,
        lat: pLat,
        lng: pLng,
        distanceMeters: Math.round(haversineMeters(lat, lng, pLat, pLng)),
        photos: [],
        openNow: rand() > 0.15,
        mapsUrl: null,
        summary,
        emoji,
        types: [`${cuisine.toLowerCase().replace(/\s+/g, "_")}_restaurant`, "restaurant", ...(BAR_LIKE.has(name) ? ["bar"] : [])],
        features: features(name),
      };
    });
    const c = filters.cuisine?.toLowerCase();
    return all.filter(
      (r) =>
        (!filters.priceLevels.length || (r.priceLevel && filters.priceLevels.includes(r.priceLevel))) &&
        (!c || r.cuisine!.toLowerCase().includes(c) || c.includes(r.cuisine!.toLowerCase())),
    );
  }
}
