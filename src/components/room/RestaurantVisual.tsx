"use client";

import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { cx } from "@/components/ui";

const GRADIENTS = [
  "linear-gradient(160deg,#ff9a5a 0%,#ff3d6e 100%)",
  "linear-gradient(160deg,#ffd166 0%,#ff7a3d 100%)",
  "linear-gradient(160deg,#5ee7c3 0%,#2a8cff 100%)",
  "linear-gradient(160deg,#b388ff 0%,#ff4fa3 100%)",
  "linear-gradient(160deg,#7bdcff 0%,#7b61ff 100%)",
  "linear-gradient(160deg,#ffb23e 0%,#e8364f 100%)",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Photo if we have one, otherwise an illustrated tile so cards never look broken. */
export function RestaurantVisual({ r, index = 0, className, emojiSize = 140 }: { r: Restaurant; index?: number; className?: string; emojiSize?: number }) {
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const src = r.photos[index];
  if (src && !failed[index]) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed((f) => ({ ...f, [index]: true }))}
        className={cx("h-full w-full object-cover select-none", className)}
      />
    );
  }
  return (
    <div className={cx("flex h-full w-full items-center justify-center", className)} style={{ background: GRADIENTS[hash(r.id) % GRADIENTS.length] }}>
      <span style={{ fontSize: emojiSize }} className="drop-shadow-[0_12px_20px_rgba(0,0,0,0.25)] select-none">
        {r.emoji ?? "🍽️"}
      </span>
    </div>
  );
}
