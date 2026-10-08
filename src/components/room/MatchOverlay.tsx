"use client";

import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { useEffect } from "react";
import { directionsUrl } from "@/lib/format";
import type { MatchInfo, Restaurant } from "@/lib/types";
import { Facts } from "./Facts";
import { RestaurantVisual } from "./RestaurantVisual";

export function MatchOverlay({
  match,
  r,
  groupSize,
  onKeepSwiping,
  onDetails,
}: {
  match: MatchInfo;
  r: Restaurant;
  groupSize: number;
  onKeepSwiping: () => void;
  onDetails: () => void;
}) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ff3d6e", "#ffb23e", "#2fe0a8", "#ffffff", "#7b61ff"];
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.35 }, colors, zIndex: 80 });
    const t = setTimeout(() => {
      confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors, zIndex: 80 });
      confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors, zIndex: 80 });
    }, 350);
    return () => clearTimeout(t);
  }, [match.restaurantId]);

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col items-center overflow-y-auto bg-night/95 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="safe-top safe-bottom flex min-h-full w-full max-w-md flex-col items-center py-6">
        <motion.h1
          className="mt-6 text-center font-display text-[56px] leading-[0.9] font-extrabold tracking-tight"
          initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.05 }}
        >
          <span className="block text-4xl">🎉</span>
          It’s a match!
        </motion.h1>
        <motion.p
          className="mt-3 text-center text-lg font-semibold text-lilac"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          {groupSize === 1 ? "You liked it — that’s a majority of one" : `${match.likes} of ${groupSize} want to go here`}
        </motion.p>

        <motion.button
          onClick={onDetails}
          className="mt-6 w-full shrink-0 overflow-hidden rounded-[28px] bg-dusk text-left ring-2 ring-mint shadow-[0_0_60px_-10px_rgba(47,224,168,0.6)]"
          initial={{ y: 40, opacity: 0, rotate: 3 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.15 }}
        >
          <div className="h-44">
            <RestaurantVisual r={r} emojiSize={110} />
          </div>
          <div className="p-5">
            <h2 className="font-display text-3xl leading-tight font-extrabold tracking-tight">{r.name}</h2>
            <div className="mt-3">
              <Facts r={r} />
            </div>
          </div>
        </motion.button>

        <div className="mt-auto flex w-full flex-col gap-3 pt-8">
          <a
            href={directionsUrl(r)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 items-center justify-center rounded-2xl bg-mint font-display text-lg font-semibold text-ink shadow-[0_10px_30px_-10px_rgba(47,224,168,0.7)] active:scale-[0.97]"
          >
            Let’s go — directions
          </a>
          <button onClick={onKeepSwiping} className="h-14 rounded-2xl font-display text-lg font-semibold text-lilac">
            Keep swiping
          </button>
        </div>
      </div>
    </motion.div>
  );
}
