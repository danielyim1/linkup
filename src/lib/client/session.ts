"use client";

export interface StoredCreds {
  participantId: string;
  token: string;
}

const key = (code: string) => `linkup:room:${code.toUpperCase()}`;

export function saveCreds(code: string, creds: StoredCreds) {
  localStorage.setItem(key(code), JSON.stringify(creds));
}

export function loadCreds(code: string): StoredCreds | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as StoredCreds) : null;
  } catch {
    return null;
  }
}

export function clearCreds(code: string) {
  localStorage.removeItem(key(code));
}

export function rememberName(name: string) {
  try { localStorage.setItem("linkup:name", name); } catch {}
}
export function recallName(): string {
  try { return localStorage.getItem("linkup:name") ?? ""; } catch { return ""; }
}

const seenKey = (code: string) => `linkup:seenMatches:${code.toUpperCase()}`;
export function loadSeenMatches(code: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(code)) ?? "[]")); } catch { return new Set(); }
}
export function markMatchSeen(code: string, id: string) {
  const s = loadSeenMatches(code);
  s.add(id);
  try { localStorage.setItem(seenKey(code), JSON.stringify([...s])); } catch {}
}
