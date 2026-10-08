"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Room } from "@/components/room/Room";
import { Button, Logo, Spinner } from "@/components/ui";
import { clearCreds, loadCreds, recallName, rememberName, saveCreds, type StoredCreds } from "@/lib/client/session";

interface RoomInfo {
  status: "lobby" | "swiping";
  locationLabel: string;
  hostName: string | null;
  people: number;
}

export default function RoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const [creds, setCreds] = useState<StoredCreds | null | undefined>(undefined);

  useEffect(() => setCreds(loadCreds(code)), [code]);

  const kicked = useCallback(() => {
    clearCreds(code);
    setCreds(null);
  }, [code]);

  if (creds === undefined)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  if (!creds) return <JoinScreen code={code} onJoined={setCreds} />;
  return <Room code={code} creds={creds} onKicked={kicked} />;
}

function JoinScreen({ code, onJoined }: { code: string; onJoined: (c: StoredCreds) => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<RoomInfo | null | "missing">(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(recallName());
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setInfo)
      .catch(() => setInfo("missing"));
  }, [code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    rememberName(name.trim());
    const c = { participantId: data.participantId, token: data.token };
    saveCreds(code, c);
    onJoined(c);
  }

  if (info === "missing")
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-6xl">🫥</div>
        <h1 className="font-display text-3xl font-bold">Room {code} doesn’t exist</h1>
        <p className="text-lilac">Double-check the code with whoever invited you.</p>
        <Button variant="secondary" onClick={() => router.push("/")}>
          Go home
        </Button>
      </main>
    );

  return (
    <form onSubmit={join} className="safe-top safe-bottom flex flex-1 flex-col px-6">
      <header className="pt-4">
        <Logo className="text-2xl" />
      </header>
      <div className="flex flex-1 flex-col justify-center">
        {!info ? (
          <Spinner />
        ) : (
          <>
            <p className="text-lg text-lilac">
              {info.hostName ? `${info.hostName} invited you to pick dinner` : "You're invited to pick dinner"}
              {info.locationLabel && ` near ${info.locationLabel}`}.
            </p>
            <h1 className="mt-3 font-display text-5xl leading-none font-extrabold tracking-tight">Join room {code}</h1>
            {info.status === "swiping" && (
              <p className="mt-4 text-mango">They’ve already started swiping — you can jump right in.</p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <label htmlFor="name" className="font-display text-lg font-semibold">
          Your name
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Jordan" autoFocus />
        {error && <p className="text-sm font-semibold text-chili">{error}</p>}
        <Button type="submit" loading={busy} className="mt-2 w-full">
          Join
        </Button>
      </div>
    </form>
  );
}
