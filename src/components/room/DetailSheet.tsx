"use client";

import { AnimatePresence, motion } from "motion/react";
import { directionsUrl } from "@/lib/format";
import type { Restaurant } from "@/lib/types";
import { Facts } from "./Facts";
import { RestaurantVisual } from "./RestaurantVisual";

export function DetailSheet({
  r,
  onClose,
  badge,
  actions,
}: {
  r: Restaurant | null;
  onClose: () => void;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {r && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={r.name}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-paper text-ink"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onClose()}
          >
            <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-ink/20" />
            </div>

            <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
              {(r.photos.length ? r.photos : [null]).map((_, i) => (
                <div key={i} className="h-60 w-[85%] shrink-0 snap-center overflow-hidden rounded-3xl first:w-full only:w-full">
                  <RestaurantVisual r={r} index={i} emojiSize={96} />
                </div>
              ))}
            </div>

            <div className="safe-bottom px-6 pt-5">
              {badge}
              <h2 className="font-display text-3xl leading-tight font-extrabold tracking-tight">{r.name}</h2>
              <div className="mt-3">
                <Facts r={r} light />
              </div>
              {r.aiReason ? (
                <p className="mt-3 text-[15px] font-semibold text-amber-700">✨ Why Claude picked it: {r.aiReason}</p>
              ) : (
                r.fit &&
                r.fit.length > 0 && <p className="mt-3 text-[15px] font-semibold text-amber-700">✨ Fits your group: {r.fit.join(", ").toLowerCase()}</p>
              )}
              {r.openNow != null && (
                <p className={`mt-3 text-[15px] font-bold ${r.openNow ? "text-emerald-600" : "text-ink/50"}`}>
                  {r.openNow ? "Open now" : "Closed right now"}
                </p>
              )}
              {r.summary && <p className="mt-3 text-[16px] leading-relaxed text-ink/75">{r.summary}</p>}
              {r.address && <p className="mt-4 text-[15px] font-semibold text-ink/60">{r.address}</p>}

              <div className="mt-6 flex flex-col gap-3 pb-2">
                <a
                  href={directionsUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 items-center justify-center rounded-2xl bg-chili font-display text-lg font-semibold text-white shadow-[0_10px_30px_-10px_rgba(255,61,110,0.8)] active:scale-[0.97]"
                >
                  Get directions
                </a>
                {actions}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
