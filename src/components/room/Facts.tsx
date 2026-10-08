import { formatCount, formatDistance, formatPrice } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

/** Rating · price · cuisine · distance row, used on cards and sheets. */
export function Facts({ r, light }: { r: Restaurant; light?: boolean }) {
  const price = formatPrice(r);
  const count = formatCount(r.ratingCount);
  const pill = light ? "bg-ink/5 text-ink" : "bg-white/18 text-white backdrop-blur-md";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold">
      {r.rating != null && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${pill}`}>
          <span className="text-mango">★</span>
          {r.rating.toFixed(1)}
          {count && <span className="font-semibold opacity-70">({count})</span>}
        </span>
      )}
      {price && <span className={`rounded-full px-2.5 py-1 ${pill}`}>{price}</span>}
      {r.cuisine && <span className={`rounded-full px-2.5 py-1 ${pill}`}>{r.cuisine}</span>}
      <span className={`rounded-full px-2.5 py-1 ${pill}`}>{formatDistance(r.distanceMeters)}</span>
    </div>
  );
}
