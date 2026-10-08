"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Chip, cx } from "@/components/ui";
import { recallName, rememberName, saveCreds } from "@/lib/client/session";
import { MILES, milesToMeters } from "@/lib/format";
import { PRICE_LABEL, type PriceLevel } from "@/lib/types";

const CUISINES = ["Pizza", "Mexican", "Sushi", "Thai", "Ramen", "Indian", "Burgers", "Korean", "Italian", "Chinese", "Vegetarian", "Seafood"];

export default function CreateRoom() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [miles, setMiles] = useState<number>(2);
  const [prices, setPrices] = useState<PriceLevel[]>([]);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(recallName()), []);

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Location isn't available on this device");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocation("Current location");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location — type a neighborhood instead");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function togglePrice(p: PriceLevel) {
    setPrices((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort()));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("What should your friends call you?");
    if (!coords && !location.trim()) return setError("Where are you eating?");
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          location,
          ...(coords ?? {}),
          filters: { radiusMeters: milesToMeters(miles), priceLevels: prices, cuisine },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      rememberName(name.trim());
      saveCreds(data.code, { participantId: data.participantId, token: data.token });
      router.replace(`/r/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the room");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="safe-top flex flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pt-2">
        <button type="button" onClick={() => router.back()} className="flex size-11 items-center justify-center rounded-full bg-dusk text-xl" aria-label="Back">
          ←
        </button>
        <h1 className="font-display text-2xl font-bold tracking-tight">New room</h1>
      </header>

      <div className="flex flex-1 flex-col gap-8 px-6 pt-8 pb-36">
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Sunny"
            autoComplete="given-name"
            className="input"
          />
        </Field>

        <Field label="Where">
          <div className="flex gap-2">
            <input
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setCoords(null);
              }}
              placeholder="Neighborhood, address or city"
              className={cx("input flex-1", coords && "text-mint")}
            />
            <button
              type="button"
              onClick={useMyLocation}
              aria-label="Use my location"
              className={cx(
                "flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl ring-1 transition active:scale-95",
                coords ? "bg-mint/15 ring-mint" : "bg-dusk ring-haze",
              )}
            >
              {locating ? <span className="size-5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : "📍"}
            </button>
          </div>
        </Field>

        <Field label="How far are you willing to go?">
          <div className="grid grid-cols-5 gap-1 rounded-2xl bg-dusk p-1 ring-1 ring-haze">
            {MILES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMiles(m)}
                className={cx("h-11 rounded-xl text-[15px] font-bold transition", miles === m ? "bg-white text-ink" : "text-lilac")}
              >
                {m} mi
              </button>
            ))}
          </div>
        </Field>

        <Field label="Price" hint={prices.length ? undefined : "Any"}>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as PriceLevel[]).map((p) => (
              <Chip key={p} active={prices.includes(p)} onClick={() => togglePrice(p)} className="w-full">
                {PRICE_LABEL[p]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Craving anything?" hint="Optional">
          <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
            <Chip active={!cuisine} onClick={() => setCuisine(null)}>
              Surprise us
            </Chip>
            {CUISINES.map((c) => (
              <Chip key={c} active={cuisine === c} onClick={() => setCuisine(cuisine === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </div>
        </Field>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md bg-gradient-to-t from-night via-night/95 to-transparent px-6 pt-8">
        {error && <p className="mb-3 text-center text-sm font-semibold text-chili">{error}</p>}
        <Button type="submit" className="w-full" loading={submitting}>
          Create room
        </Button>
      </div>

    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold">{label}</span>
        {hint && <span className="text-sm text-lilac">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
