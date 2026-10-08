"use client";

import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Restaurant } from "@/lib/types";
import { Facts } from "./Facts";
import { RestaurantVisual } from "./RestaurantVisual";

export interface DeckHandle {
  swipe: (liked: boolean) => void;
}

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

/**
 * Renders the top few cards of the deck. Only the top card is interactive; the
 * one behind scales up as the top card is dragged away.
 */
export function SwipeDeck({
  cards,
  onSwipe,
  onInfo,
  ref,
}: {
  cards: Restaurant[];
  onSwipe: (r: Restaurant, liked: boolean) => void;
  onInfo: (r: Restaurant) => void;
  ref?: Ref<DeckHandle>;
}) {
  const x = useMotionValue(0);
  const flying = useRef(false);
  const top = cards[0];

  const behindScale = useTransform(x, [-200, 0, 200], [1, 0.94, 1]);
  const behindY = useTransform(x, [-200, 0, 200], [0, 14, 0]);

  function fly(liked: boolean, velocity = 0) {
    if (!top || flying.current) return;
    flying.current = true;
    navigator.vibrate?.(8);
    const target = (liked ? 1 : -1) * (window.innerWidth + 200);
    animate(x, target, { type: "tween", ease: "easeOut", duration: Math.max(0.18, 0.32 - Math.abs(velocity) / 8000) }).then(() => {
      onSwipe(top, liked);
      x.jump(0);
      flying.current = false;
    });
  }

  useImperativeHandle(ref, () => ({ swipe: (liked) => fly(liked) }));

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) fly(true, velocity.x);
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) fly(false, velocity.x);
    else animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
  }

  return (
    <div className="absolute inset-0">
      {cards
        .slice(0, 3)
        .map((r, i) => ({ r, i }))
        .reverse()
        .map(({ r, i }) =>
          i === 0 ? (
            <TopCard key={r.id} r={r} x={x} onDragEnd={onDragEnd} onInfo={() => onInfo(r)} />
          ) : (
            <motion.div
              key={r.id}
              className="absolute inset-0"
              style={i === 1 ? { scale: behindScale, y: behindY } : { scale: 0.88, y: 28, opacity: 0.6 }}
            >
              <Card r={r} />
            </motion.div>
          ),
        )}
    </div>
  );
}

function TopCard({
  r,
  x,
  onDragEnd,
  onInfo,
}: {
  r: Restaurant;
  x: ReturnType<typeof useMotionValue<number>>;
  onDragEnd: (e: unknown, info: PanInfo) => void;
  onInfo: () => void;
}) {
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [20, 110], [0, 1]);
  const nopeOpacity = useTransform(x, [-110, -20], [1, 0]);
  const [photo, setPhoto] = useState(0);
  const photoCount = Math.max(r.photos.length, 1);

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragMomentum={false}
      dragElastic={1}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.94, y: 14 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onTap={(e, info) => {
        // Tap left/right edge to flip photos, tap the info area for details.
        const el = (e.target as HTMLElement).closest("[data-card]") as HTMLElement | null;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const relX = info.point.x - window.scrollX - rect.left;
        const relY = info.point.y - window.scrollY - rect.top;
        if (relY > rect.height * 0.62) return onInfo();
        if (photoCount < 2) return;
        setPhoto((p) => (relX < rect.width / 2 ? Math.max(0, p - 1) : Math.min(photoCount - 1, p + 1)));
      }}
    >
      <Card r={r} photo={photo} photoCount={photoCount} />
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute top-10 left-6 -rotate-12 rounded-2xl border-[5px] border-mint px-4 py-1 font-display text-5xl font-extrabold tracking-tight text-mint"
      >
        YUM
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        className="pointer-events-none absolute top-10 right-6 rotate-12 rounded-2xl border-[5px] border-chili px-4 py-1 font-display text-5xl font-extrabold tracking-tight text-chili"
      >
        NOPE
      </motion.div>
    </motion.div>
  );
}

function Card({ r, photo = 0, photoCount = 1 }: { r: Restaurant; photo?: number; photoCount?: number }) {
  return (
    <div data-card className="relative h-full w-full overflow-hidden rounded-[28px] bg-dusk shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
      <RestaurantVisual r={r} index={photo} />

      {photoCount > 1 && (
        <div className="absolute inset-x-3 top-3 flex gap-1">
          {Array.from({ length: photoCount }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i === photo ? "bg-white" : "bg-white/35"}`} />
          ))}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pt-28 pb-5">
        {r.openNow != null && (
          <span className={`mb-2 inline-flex items-center gap-1.5 text-sm font-bold ${r.openNow ? "text-mint" : "text-lilac"}`}>
            <span className={`size-2 rounded-full ${r.openNow ? "bg-mint" : "bg-lilac"}`} />
            {r.openNow ? "Open now" : "Closed now"}
          </span>
        )}
        <h2 className="font-display text-[34px] leading-[1.02] font-extrabold tracking-tight text-white">{r.name}</h2>
        <div className="mt-3">
          <Facts r={r} />
        </div>
        {r.aiReason ? (
          <p className="mt-2.5 flex items-start gap-1.5 text-[15px] leading-snug font-bold text-mango">
            <span aria-hidden>✨</span>
            <span>{r.aiReason}</span>
          </p>
        ) : (
          r.fit &&
          r.fit.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm font-bold">
              <span className="text-mango" aria-label="Fits your group">✨</span>
              {r.fit.map((reason) => (
                <span key={reason} className="rounded-full bg-mango/20 px-2.5 py-0.5 text-mango backdrop-blur-md">
                  {reason}
                </span>
              ))}
            </div>
          )
        )}
        {r.summary && <p className="mt-3 line-clamp-2 text-[15px] text-white/80">{r.summary}</p>}
      </div>
    </div>
  );
}
