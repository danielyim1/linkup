"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatDistance } from "@/lib/format";
import { PRICE_LABEL, type GuestPreferences, type RoomSnapshot } from "@/lib/types";
import { Avatar, Button, cx } from "@/components/ui";
import { WishBox } from "./WishBox";

export function Lobby({
  s,
  me,
  onReady,
  onForceStart,
  onWish,
}: {
  s: RoomSnapshot;
  me: string;
  onReady: (ready: boolean) => void;
  onForceStart: () => void;
  onWish: (text: string) => Promise<GuestPreferences | null>;
}) {
  const [copied, setCopied] = useState(false);
  const self = s.participants.find((p) => p.id === me);
  const readyCount = s.participants.filter((p) => p.isReady).length;
  const waitingOn = s.participants.filter((p) => !p.isReady);

  async function share() {
    const url = `${location.origin}/r/${s.code}`;
    const text = `Help pick dinner near ${s.locationLabel} — join my LinkUp room ${s.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "LinkUp", text, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filters = [
    `Within ${formatDistance(s.filters.radiusMeters)}`,
    s.filters.priceLevels.length ? s.filters.priceLevels.map((p) => PRICE_LABEL[p]).join(", ") : "Any price",
    s.filters.cuisine ?? "Any cuisine",
  ];

  return (
    <div className="flex flex-1 flex-col px-6 pt-6">
      <p className="text-lg text-lilac">Dinner near {s.locationLabel}</p>

      <div className="mt-5 flex justify-between gap-2" aria-label={`Room code ${s.code}`}>
        {s.code.split("").map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: 16, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: [-4, 3, -2, 4, -3][i] }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 18 }}
            className="flex aspect-[4/5] flex-1 items-center justify-center rounded-2xl bg-paper font-display text-5xl font-extrabold text-ink shadow-[0_8px_0_0_rgba(0,0,0,0.25)]"
          >
            {ch}
          </motion.span>
        ))}
      </div>

      <Button variant="secondary" onClick={share} className="mt-6 w-full">
        {copied ? "Link copied ✓" : "Invite friends"}
      </Button>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <span key={f} className="rounded-full bg-dusk px-3 py-1.5 text-sm font-semibold text-lilac ring-1 ring-haze">
            {f}
          </span>
        ))}
      </div>

      {self && <WishBox self={self} aiMode={s.aiMode} roomPrices={s.filters.priceLevels} onSave={onWish} />}

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold">Who’s in</h2>
        <span className="text-sm font-semibold text-lilac">
          {readyCount}/{s.participants.length} ready
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2 pb-40">
        <AnimatePresence initial={false}>
          {s.participants.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 rounded-2xl bg-dusk/80 px-3 py-2.5 ring-1 ring-haze"
            >
              <div className="relative">
                <Avatar p={p} size={44} />
                <span
                  className={cx("absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-dusk", p.online ? "bg-mint" : "bg-haze")}
                  title={p.online ? "Online" : "Away"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {p.name}
                  {p.id === me && <span className="font-medium text-lilac"> (you)</span>}
                  {p.isHost && <span className="font-medium text-lilac"> · host</span>}
                </p>
                {p.wishPrefs && p.wishPrefs.summary !== "no preference" ? (
                  <p className="truncate text-sm text-mint">✨ {p.wishPrefs.summary}</p>
                ) : (
                  p.id !== me && <p className="text-sm text-lilac/70">No wish yet</p>
                )}
              </div>
              <span
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-bold transition-colors",
                  p.isReady ? "bg-mint text-ink" : "bg-white/5 text-lilac",
                )}
              >
                {p.isReady ? "Ready" : "Not yet"}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md bg-gradient-to-t from-night via-night/95 to-transparent px-6 pt-10">
        {s.participants.length === 1 && (
          <p className="mb-3 text-center text-sm text-lilac">Share the code — or start solo to try it out.</p>
        )}
        {self?.isReady ? (
          <Button variant="secondary" className="w-full" onClick={() => onReady(false)}>
            Waiting on {waitingOn.length === 1 ? waitingOn[0].name : `${waitingOn.length} friends`}… tap to undo
          </Button>
        ) : (
          <Button className="w-full" onClick={() => onReady(true)}>
            I’m ready — start
          </Button>
        )}
        {self?.isHost && waitingOn.length > 0 && s.participants.length > 1 && (
          <button onClick={onForceStart} className="mt-2 h-11 w-full text-sm font-semibold text-lilac underline-offset-4 hover:underline">
            Start without waiting
          </button>
        )}
      </div>
    </div>
  );
}
