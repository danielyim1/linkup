"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Logo } from "@/components/ui";

const FLOATERS = ["🍜", "🌮", "🍕", "🍣", "🥟", "🍔"];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.replace(/[^a-z]/gi, "").toUpperCase();
    if (c.length !== 5) return setError("Room codes are 5 letters");
    setChecking(true);
    const res = await fetch(`/api/rooms/${c}`);
    setChecking(false);
    if (!res.ok) return setError("No room with that code");
    router.push(`/r/${c}`);
  }

  return (
    <main className="safe-top safe-bottom flex flex-1 flex-col px-6">
      <header className="pt-4">
        <Logo className="text-2xl" />
      </header>

      <section className="relative flex flex-1 flex-col justify-center py-10">
        <div className="pointer-events-none absolute -top-2 right-0 grid grid-cols-3 gap-3 text-4xl opacity-90 select-none" aria-hidden>
          {FLOATERS.map((f, i) => (
            <span
              key={f}
              className="flex size-16 items-center justify-center rounded-2xl bg-dusk ring-1 ring-haze"
              style={{ transform: `rotate(${(i % 2 ? 1 : -1) * (4 + i * 2)}deg) translateY(${i % 3 * 6}px)` }}
            >
              {f}
            </span>
          ))}
        </div>

        <h1 className="mt-40 font-display text-[52px] leading-[0.95] font-extrabold tracking-tight">
          Where are we eating?
        </h1>
        <p className="mt-4 max-w-[30ch] text-lg text-lilac">
          Everyone swipes on nearby spots from their own phone. The first place most of you love wins.
        </p>
      </section>

      <div className="flex flex-col gap-4 pb-2">
        <Button className="w-full" onClick={() => router.push("/create")}>
          Start a room
        </Button>

        <form onSubmit={join} className="flex gap-2">
          <label className="sr-only" htmlFor="code">Room code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value.toUpperCase().slice(0, 5));
            }}
            placeholder="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-14 min-w-0 flex-1 rounded-2xl bg-dusk px-5 font-display text-xl font-bold tracking-[0.3em] uppercase ring-1 ring-haze placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-base placeholder:font-medium placeholder:text-lilac/70 focus:ring-2 focus:ring-white focus:outline-none"
          />
          <Button variant="secondary" type="submit" loading={checking} className="px-5">
            Join
          </Button>
        </form>
        <p className="h-5 text-center text-sm font-semibold text-chili">{error}</p>
      </div>
    </main>
  );
}
