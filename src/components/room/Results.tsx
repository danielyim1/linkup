"use client";

import type { Restaurant, RoomSnapshot } from "@/lib/types";
import { Facts } from "./Facts";
import { RestaurantVisual } from "./RestaurantVisual";

/** Shown once *you* have swiped every card. Aggregate likes appear only after everyone finishes. */
export function Results({ s, me, onInfo }: { s: RoomSnapshot; me: string; onInfo: (r: Restaurant) => void }) {
  const total = s.restaurants.length;
  const waitingOn = s.participants.filter((p) => p.id !== me && p.swipedCount < total);
  const matched = new Set(s.matches.map((m) => m.restaurantId));
  const n = s.participants.length;

  if (!s.finalTally) {
    const matches = s.restaurants.filter((r) => matched.has(r.id));
    return (
      <div className="flex flex-1 flex-col px-6 pt-10 pb-10">
        <div className="text-5xl">🙌</div>
        <h2 className="mt-4 font-display text-4xl leading-none font-extrabold tracking-tight">You’re through the deck</h2>
        <p className="mt-3 text-lg text-lilac">
          Waiting on {waitingOn.map((p) => p.name).join(", ") || "the group"}. Results show up here the moment everyone’s done.
        </p>
        {matches.length > 0 && (
          <>
            <h3 className="mt-8 font-display text-xl font-bold">Matched so far</h3>
            <List items={matches.map((r) => ({ r, likes: s.matches.find((m) => m.restaurantId === r.id)!.likes }))} n={n} matched={matched} onInfo={onInfo} />
          </>
        )}
      </div>
    );
  }

  const tally = s.finalTally;
  const ranked = s.restaurants
    .map((r) => ({ r, likes: tally[r.id] ?? 0 }))
    .filter((x) => x.likes > 0)
    .sort((a, b) => Number(matched.has(b.r.id)) - Number(matched.has(a.r.id)) || b.likes - a.likes)
    .slice(0, 8);
  const winner = ranked[0];

  return (
    <div className="flex flex-1 flex-col px-6 pt-8 pb-10">
      {s.matches.length > 0 ? (
        <>
          <div className="text-5xl">🎉</div>
          <h2 className="mt-3 font-display text-4xl leading-none font-extrabold tracking-tight">Everyone’s done</h2>
          <p className="mt-3 text-lg text-lilac">
            {s.matches.length === 1 ? "One clear winner." : `${s.matches.length} places got a majority. Top pick first.`}
          </p>
        </>
      ) : winner ? (
        <>
          <div className="text-5xl">🤝</div>
          <h2 className="mt-3 font-display text-4xl leading-none font-extrabold tracking-tight">No majority this time</h2>
          <p className="mt-3 text-lg text-lilac">These came closest. Pick one together, or start a new room with wider filters.</p>
        </>
      ) : (
        <>
          <div className="text-5xl">😶</div>
          <h2 className="mt-3 font-display text-4xl leading-none font-extrabold tracking-tight">Tough crowd</h2>
          <p className="mt-3 text-lg text-lilac">Nobody liked anything. Try a new room with different filters.</p>
        </>
      )}
      <List items={ranked} n={n} matched={matched} onInfo={onInfo} />
      <a href="/create" className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-white/10 font-display text-lg font-semibold ring-1 ring-white/15">
        Start a new room
      </a>
    </div>
  );
}

function List({ items, n, matched, onInfo }: { items: { r: Restaurant; likes: number }[]; n: number; matched: Set<string>; onInfo: (r: Restaurant) => void }) {
  return (
    <ul className="mt-5 flex flex-col gap-3">
      {items.map(({ r, likes }, i) => (
        <li key={r.id}>
          <button
            onClick={() => onInfo(r)}
            className={`flex w-full gap-3 rounded-3xl p-2.5 text-left ring-1 ${matched.has(r.id) ? "bg-mint/10 ring-mint" : "bg-dusk ring-haze"}`}
          >
            <div className="size-24 shrink-0 overflow-hidden rounded-2xl">
              <RestaurantVisual r={r} emojiSize={44} />
            </div>
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate font-display text-lg font-bold">
                {i === 0 && matched.has(r.id) ? "🏆 " : ""}
                {r.name}
              </p>
              <div className="mt-1.5 origin-left scale-90">
                <Facts r={r} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-chili" style={{ width: `${(likes / n) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-lilac">
                  {likes}/{n} ♥
                </span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
