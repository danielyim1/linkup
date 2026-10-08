"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { PRICE_LABEL, type GuestPreferences, type Participant, type PriceLevel } from "@/lib/types";
import { Spinner, cx } from "@/components/ui";

const IDEAS = [
  "Casual, not too pricey, somewhere we can actually talk",
  "Cheap and quick, I'm starving",
  "Something fun with good drinks",
  "I'm vegetarian",
  "Not pizza again",
];

/** Tags shown under a parsed wish so people can see exactly how the AI understood them. */
export function prefTags(p: GuestPreferences): string[] {
  const price = p.priceLevels.length
    ? p.priceLevels.length === 1
      ? PRICE_LABEL[p.priceLevels[0]]
      : `${PRICE_LABEL[p.priceLevels[0]]}–${PRICE_LABEL[p.priceLevels[p.priceLevels.length - 1]]}`
    : null;
  return [
    ...(price ? [price] : []),
    ...p.vibes.map((v) => v.replace(/_/g, " ")),
    ...p.cuisinesWanted,
    ...p.dietary.map((d) => d.replace(/_/g, "-")),
    ...p.cuisinesAvoid.map((c) => `no ${c.toLowerCase()}`),
    ...p.avoidVibes.map((v) => `not ${v.replace(/_/g, " ")}`),
    ...(p.openNowOnly ? ["open now"] : []),
  ];
}

export function WishBox({
  self,
  aiMode,
  roomPrices,
  onSave,
}: {
  self: Participant;
  aiMode: "llm" | "basic";
  /** The host's price filter for this room ([] = any price). It's strict; wishes can't override it. */
  roomPrices: PriceLevel[];
  onSave: (text: string) => Promise<GuestPreferences | null>;
}) {
  const [text, setText] = useState(self.wish ?? "");
  const [editing, setEditing] = useState(!self.wish);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep in sync if the server state changes (e.g. after a reconnect).
  useEffect(() => {
    if (!editing) setText(self.wish ?? "");
  }, [self.wish, editing]);

  async function save(value = text) {
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
      setEditing(!value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl bg-dusk p-4 ring-1 ring-haze">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">What are you in the mood for?</h2>
        <span className="shrink-0 text-xl" aria-hidden>
          ✨
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing || !self.wishPrefs ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="mt-1 text-[15px] text-lilac">Say it however you’d text it. We’ll steer the deck toward it.</p>
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) save();
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 280))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim()) save();
                  }
                }}
                rows={2}
                placeholder="e.g. somewhere casual and not too expensive where we can actually talk"
                className="w-full resize-none rounded-2xl bg-night/70 px-4 py-3 text-[16px] font-medium ring-1 ring-haze outline-none placeholder:text-lilac/60 focus:ring-2 focus:ring-white"
              />
              {!text && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setText(idea)}
                      className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-sm font-semibold text-lilac ring-1 ring-haze active:scale-95"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white font-display font-semibold text-ink transition active:scale-[0.98] disabled:opacity-40"
                >
                  {busy ? (
                    <>
                      <Spinner className="size-4" /> Reading your vibe…
                    </>
                  ) : (
                    "Tell the group"
                  )}
                </button>
                {self.wish && !busy && (
                  <button type="button" onClick={() => { setText(self.wish ?? ""); setEditing(false); }} className="h-11 px-3 text-sm font-semibold text-lilac">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="mt-2 text-[16px] font-medium text-white/90">“{self.wish}”</p>
            <p className="mt-3 text-sm font-semibold text-lilac">{aiMode === "llm" ? "Here’s what we heard:" : "Picked up:"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prefTags(self.wishPrefs).length ? (
                prefTags(self.wishPrefs).map((t) => (
                  <span key={t} className={cx("rounded-full px-2.5 py-1 text-sm font-bold", t.startsWith("no ") || t.startsWith("not ") ? "bg-chili/15 text-chili" : "bg-mint/15 text-mint")}>
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-sm text-lilac">Nothing specific — you’re easy. 👍</span>
              )}
            </div>
            {roomPrices.length > 0 &&
              self.wishPrefs.priceLevels.length > 0 &&
              !self.wishPrefs.priceLevels.some((l) => roomPrices.includes(l)) && (
                <p className="mt-3 rounded-xl bg-mango/10 px-3 py-2 text-sm font-semibold text-mango">
                  Heads up: this room only searches {roomPrices.map((l) => PRICE_LABEL[l]).join(", ")} places, so you’ll only see those. Start a
                  new room with a different price to change it.
                </p>
              )}
            <div className="mt-3 flex gap-4">
              <button onClick={() => setEditing(true)} className="text-sm font-semibold text-white underline underline-offset-4">
                Change
              </button>
              <button onClick={() => { setText(""); save(""); }} disabled={busy} className="text-sm font-semibold text-lilac">
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="mt-2 text-sm font-semibold text-chili">{error}</p>}
      {aiMode === "basic" && (
        <p className="mt-3 text-xs text-lilac/70">Simple keyword matching — add an ANTHROPIC_API_KEY on the server for AI understanding.</p>
      )}
    </section>
  );
}
