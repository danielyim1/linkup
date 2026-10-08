"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { useRoom } from "@/lib/client/useRoom";
import type { StoredCreds } from "@/lib/client/session";
import type { Restaurant, RoomSnapshot } from "@/lib/types";
import { Logo, ProgressAvatar, Spinner, Toast, cx } from "@/components/ui";
import { DetailSheet } from "./DetailSheet";
import { Lobby } from "./Lobby";
import { MatchOverlay } from "./MatchOverlay";
import { SwipeDeck, type DeckHandle } from "./SwipeDeck";
import { Results } from "./Results";
import { RestaurantVisual } from "./RestaurantVisual";

export function Room({ code, creds, onKicked }: { code: string; creds: StoredCreds; onKicked: () => void }) {
  const room = useRoom(code, creds, onKicked);
  const { snapshot: s, conn, starting, toast, matchQueue } = room;
  const [detail, setDetail] = useState<Restaurant | null>(null);
  const [showMatches, setShowMatches] = useState(false);

  const byId = useMemo(() => new Map(s?.restaurants.map((r) => [r.id, r]) ?? []), [s?.restaurants]);
  const currentMatch = matchQueue.find((m) => byId.has(m.restaurantId));

  if (!s)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-lilac">
        <Spinner />
        <p>Joining room {code}…</p>
      </div>
    );

  return (
    <div className="safe-top flex flex-1 flex-col">
      <header className="flex h-12 items-center justify-between px-5">
        <a href="/" aria-label="LinkUp home">
          <Logo className="text-xl" />
        </a>
        <div className="flex items-center gap-2">
          {conn !== "live" && (
            <span className="flex items-center gap-1.5 rounded-full bg-mango/15 px-3 py-1 text-xs font-bold text-mango">
              <span className="size-1.5 animate-pulse rounded-full bg-mango" />
              Reconnecting
            </span>
          )}
          {s.status === "swiping" && (
            <button
              onClick={() => setShowMatches(true)}
              className={cx(
                "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition",
                s.matches.length ? "bg-mint text-ink" : "bg-dusk text-lilac ring-1 ring-haze",
              )}
            >
              {s.matches.length ? `🎉 ${s.matches.length} match${s.matches.length > 1 ? "es" : ""}` : `Room ${s.code}`}
            </button>
          )}
        </div>
      </header>

      {s.status === "lobby" && !starting && (
        <Lobby s={s} me={room.me} onReady={room.setReady} onForceStart={room.forceStart} onWish={room.setWish} />
      )}
      {s.status === "lobby" && starting && (
        <Starting
          label={s.locationLabel}
          tuned={s.participants.some((p) => p.wishPrefs && p.wishPrefs.summary !== "no preference")}
          aiOn={s.aiMode === "llm"}
        />
      )}
      {s.status === "swiping" && <SwipeView s={s} me={room.me} onVote={room.vote} onInfo={setDetail} />}

      <DetailSheet r={detail} onClose={() => setDetail(null)} badge={detail && <MatchBadge s={s} id={detail.id} />} />

      <MatchesSheet
        open={showMatches}
        s={s}
        onClose={() => setShowMatches(false)}
        onPick={(r) => {
          setShowMatches(false);
          setDetail(r);
        }}
      />

      <AnimatePresence>
        {currentMatch && (
          <MatchOverlay
            key={currentMatch.restaurantId}
            match={currentMatch}
            r={byId.get(currentMatch.restaurantId)!}
            groupSize={s.participants.length}
            onKeepSwiping={() => room.dismissMatch(currentMatch.restaurantId)}
            onDetails={() => {
              room.dismissMatch(currentMatch.restaurantId);
              setDetail(byId.get(currentMatch.restaurantId)!);
            }}
          />
        )}
      </AnimatePresence>

      <Toast message={toast} />
    </div>
  );
}

function MatchBadge({ s, id }: { s: RoomSnapshot; id: string }) {
  const m = s.matches.find((x) => x.restaurantId === id);
  if (!m) return null;
  return (
    <span className="mb-2 inline-block rounded-full bg-mint px-3 py-1 text-sm font-bold text-ink">
      🎉 Match · {m.likes} of {s.participants.length} liked it
    </span>
  );
}

function Starting({ label, tuned, aiOn }: { label: string; tuned: boolean; aiOn: boolean }) {
  const emojis = ["🍕", "🌮", "🍜", "🍣", "🍔"];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="flex gap-2 text-4xl">
        {emojis.map((e, i) => (
          <motion.span
            key={e}
            animate={{ y: [0, -14, 0] }}
            transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.12, ease: "easeInOut" }}
          >
            {e}
          </motion.span>
        ))}
      </div>
      <div>
        <h2 className="font-display text-3xl font-bold">Finding spots near {label}</h2>
        <p className="mt-2 text-lilac">
          {tuned
            ? aiOn
              ? "Claude is reading the options and picking the best ones for what everyone said."
              : "Ranking them by what everyone said they’re in the mood for."
            : "Everyone gets the same deck. Your swipes stay private."}
        </p>
      </div>
    </div>
  );
}

function SwipeView({
  s,
  me,
  onVote,
  onInfo,
}: {
  s: RoomSnapshot;
  me: string;
  onVote: (id: string, liked: boolean) => void;
  onInfo: (r: Restaurant) => void;
}) {
  const deck = useRef<DeckHandle>(null);
  const remaining = s.restaurants.filter((r) => !(r.id in s.myVotes));
  const total = s.restaurants.length;

  return (
    <div className="flex flex-1 flex-col">
      {/* Group progress — how far each friend is, never what they picked */}
      <div className="no-scrollbar flex items-center gap-3 overflow-x-auto px-5 py-2">
        {s.participants.map((p) => (
          <div key={p.id} className={cx("flex flex-col items-center gap-1", !p.online && "opacity-45")}>
            <ProgressAvatar p={p} progress={total ? p.swipedCount / total : 0} size={40} />
            <span className="max-w-14 truncate text-[11px] font-semibold text-lilac">{p.id === me ? "You" : p.name}</span>
          </div>
        ))}
        <p className="ml-auto shrink-0 pl-2 text-right text-xs leading-tight text-lilac">
          {s.likesNeeded} {s.likesNeeded === 1 ? "like" : "likes"}
          <br />
          to match
        </p>
      </div>

      {s.groupVibe && remaining.length > 0 && (
        <p className="mx-5 mb-1 truncate text-sm font-semibold text-lilac">
          <span className="text-mango">✨</span> {s.curatedBy === "ai" ? "Picked by Claude for" : "Tuned for"} {s.groupVibe}
        </p>
      )}

      {remaining.length === 0 ? (
        <Results s={s} me={me} onInfo={onInfo} />
      ) : (
        <>
          <div className="relative mx-4 mt-2 flex-1" style={{ minHeight: 420 }}>
            <SwipeDeck ref={deck} cards={remaining} onSwipe={(r, liked) => onVote(r.id, liked)} onInfo={onInfo} />
          </div>

          <div className="safe-bottom flex items-center justify-center gap-6 pt-5">
            <RoundButton label="Pass" onClick={() => deck.current?.swipe(false)} className="size-[68px] bg-dusk text-3xl text-lilac ring-1 ring-haze">
              ✕
            </RoundButton>
            <RoundButton label="Details" onClick={() => remaining[0] && onInfo(remaining[0])} className="size-12 bg-dusk text-lg font-bold text-white ring-1 ring-haze">
              i
            </RoundButton>
            <RoundButton label="Like" onClick={() => deck.current?.swipe(true)} className="size-[68px] bg-chili text-3xl text-white shadow-[0_12px_30px_-8px_rgba(255,61,110,0.9)]">
              ♥
            </RoundButton>
          </div>
          <p className="pb-2 text-center text-xs font-semibold text-lilac/80">
            {total - remaining.length + 1} of {total}
          </p>
        </>
      )}
    </div>
  );
}

function RoundButton({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      aria-label={label}
      onClick={onClick}
      className={cx("flex items-center justify-center rounded-full font-display", className)}
    >
      {children}
    </motion.button>
  );
}

function MatchesSheet({ open, s, onClose, onPick }: { open: boolean; s: RoomSnapshot; onClose: () => void; onPick: (r: Restaurant) => void }) {
  const list = s.matches.map((m) => ({ m, r: s.restaurants.find((r) => r.id === m.restaurantId) })).filter((x) => x.r);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-dusk px-5 pt-5"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <h2 className="font-display text-2xl font-bold">Matches</h2>
            <p className="mt-1 text-sm text-lilac">
              Room {s.code} · {s.likesNeeded} of {s.participants.length} likes makes a match
            </p>
            {list.length === 0 ? (
              <p className="py-10 text-center text-lilac">No matches yet. Keep swiping!</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2 pb-4">
                {list.map(({ m, r }) => (
                  <li key={m.restaurantId}>
                    <button onClick={() => onPick(r!)} className="flex w-full items-center gap-3 rounded-2xl bg-night/60 p-2 text-left ring-1 ring-haze">
                      <div className="size-16 shrink-0 overflow-hidden rounded-xl">
                        <MiniVisual r={r!} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{r!.name}</p>
                        <p className="text-sm text-lilac">
                          {m.likes} of {s.participants.length} liked it
                        </p>
                      </div>
                      <span className="pr-2 text-lilac">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MiniVisual({ r }: { r: Restaurant }) {
  return <RestaurantVisual r={r} emojiSize={30} />;
}
