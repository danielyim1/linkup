"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Participant } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "mint";

export function Button({
  variant = "primary",
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-chili text-white shadow-[0_10px_30px_-10px_rgba(255,61,110,0.8)]",
    mint: "bg-mint text-ink shadow-[0_10px_30px_-10px_rgba(47,224,168,0.7)]",
    secondary: "bg-white/10 text-white ring-1 ring-white/15",
    ghost: "text-lilac",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "relative inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 font-display text-lg font-semibold tracking-tight transition active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        styles[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function Avatar({ p, size = 44, ring }: { p: Pick<Participant, "name" | "color">; size?: number; ring?: ReactNode }) {
  const initials = p.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {ring}
      <div
        className="absolute inset-[3px] flex items-center justify-center rounded-full font-display font-bold text-white"
        style={{ background: p.color, fontSize: size * 0.36 }}
      >
        {initials}
      </div>
    </div>
  );
}

/** Avatar with a progress ring showing how far through the deck someone is. */
export function ProgressAvatar({ p, progress, size = 40 }: { p: Participant; progress: number; size?: number }) {
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * r;
  return (
    <Avatar
      p={p}
      size={size}
      ring={
        <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={progress >= 1 ? "var(--color-mint)" : p.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(progress, 1))}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        </svg>
      }
    />
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "h-11 shrink-0 rounded-full px-4 text-[15px] font-semibold transition active:scale-95",
        active ? "bg-white text-ink" : "bg-dusk text-lilac ring-1 ring-haze",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div className="rounded-2xl bg-white px-4 py-3 text-[15px] font-semibold text-ink shadow-2xl">{message}</div>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-display font-extrabold tracking-tight", className)}>
      <svg viewBox="0 0 64 64" className="h-[0.9em] w-[0.9em]" aria-hidden>
        <rect width="64" height="64" rx="18" fill="var(--color-chili)" />
        <path d="M32 48s-14-8.6-14-19a8 8 0 0 1 14-5.3A8 8 0 0 1 46 29c0 10.4-14 19-14 19z" fill="#fff" />
      </svg>
      LinkUp
    </span>
  );
}
