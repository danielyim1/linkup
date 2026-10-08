"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, GuestPreferences, MatchInfo, RoomSnapshot, ServerToClient } from "@/lib/types";
import { loadSeenMatches, markMatchSeen, type StoredCreds } from "./session";

type Sock = Socket<ServerToClient, ClientToServer>;
export type ConnState = "connecting" | "live" | "reconnecting";

export function useRoom(code: string, creds: StoredCreds, onKicked: () => void) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [matchQueue, setMatchQueue] = useState<MatchInfo[]>([]);
  const sockRef = useRef<Sock | null>(null);
  const kickedRef = useRef(onKicked);
  kickedRef.current = onKicked;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const enqueueMatches = useCallback(
    (ms: MatchInfo[]) => {
      const seen = loadSeenMatches(code);
      const fresh = ms.filter((m) => !seen.has(m.restaurantId));
      if (fresh.length)
        setMatchQueue((q) => [...q, ...fresh.filter((m) => !q.some((x) => x.restaurantId === m.restaurantId))]);
    },
    [code],
  );

  useEffect(() => {
    const socket: Sock = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    sockRef.current = socket;

    const join = () =>
      socket.emit("room:join", { code, ...creds }, (res) => {
        if (!res.ok) {
          if (res.error === "not_member") kickedRef.current();
          else flash(res.error);
          return;
        }
        setConn("live");
      });

    socket.on("connect", join);
    socket.on("disconnect", () => setConn("reconnecting"));

    socket.on("room:snapshot", (s) => {
      setSnapshot(s);
      if (s.status === "swiping") setStarting(false);
      enqueueMatches(s.matches);
    });
    socket.on("room:participants", ({ participants, likesNeeded }) =>
      setSnapshot((s) => (s ? { ...s, participants, likesNeeded } : s)),
    );
    socket.on("room:starting", () => setStarting(true));
    socket.on("room:error", ({ message }) => {
      setStarting(false);
      flash(message);
    });
    socket.on("match:new", (m) => {
      setSnapshot((s) =>
        s && !s.matches.some((x) => x.restaurantId === m.restaurantId) ? { ...s, matches: [...s.matches, m] } : s,
      );
      enqueueMatches([m]);
      navigator.vibrate?.([30, 40, 60]);
    });
    socket.on("room:tally", (t) => setSnapshot((s) => (s ? { ...s, finalTally: t } : s)));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [code, creds, enqueueMatches, flash]);

  const setReady = useCallback((ready: boolean) => {
    setSnapshot((s) =>
      s ? { ...s, participants: s.participants.map((p) => (p.id === creds.participantId ? { ...p, isReady: ready } : p)) } : s,
    );
    sockRef.current?.emit("room:ready", { ready });
  }, [creds.participantId]);

  /** Send what you're in the mood for; resolves with how the AI understood it. */
  const setWish = useCallback(
    (text: string) =>
      new Promise<GuestPreferences | null>((resolve, reject) => {
        const sock = sockRef.current;
        if (!sock?.connected) return reject(new Error("Not connected — try again in a second"));
        sock.timeout(20_000).emit("wish:set", { text }, (err, res) => {
          if (err) return reject(new Error("That took too long — try again"));
          if (!res.ok) return reject(new Error(res.error));
          resolve(res.prefs);
        });
      }),
    [],
  );

  const forceStart = useCallback(() => sockRef.current?.emit("room:start"), []);

  const vote = useCallback(
    (restaurantId: string, liked: boolean) => {
      setSnapshot((s) => (s ? { ...s, myVotes: { ...s.myVotes, [restaurantId]: liked } } : s));
      sockRef.current?.emit("vote:cast", { restaurantId, liked }, (res) => {
        if (!res.ok) {
          setSnapshot((s) => {
            if (!s) return s;
            const myVotes = { ...s.myVotes };
            delete myVotes[restaurantId];
            return { ...s, myVotes };
          });
          flash(res.error ?? "Vote didn't go through — try again");
        }
      });
    },
    [flash],
  );

  const dismissMatch = useCallback(
    (id: string) => {
      markMatchSeen(code, id);
      setMatchQueue((q) => q.filter((m) => m.restaurantId !== id));
    },
    [code],
  );

  return { snapshot, conn, starting, toast, matchQueue, setReady, setWish, forceStart, vote, dismissMatch, me: creds.participantId };
}
