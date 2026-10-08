#!/usr/bin/env node
/**
 * HOOK: SessionStart (runs once when a Claude Code session opens in this project)
 *
 * Job: give Claude a quick status report so it doesn't have to guess (or peek at .env).
 * For SessionStart, whatever this script prints is added to Claude's context.
 *
 * It reports whether keys are SET or MISSING — never their values.
 */
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function portOpen(port) {
  return new Promise((resolve) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.setTimeout(800);
    s.on("connect", () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
    s.on("timeout", () => (s.destroy(), resolve(false)));
  });
}

// Read .env only to learn which keys have values. Values never leave this script.
const keys = { DATABASE_URL: false, GOOGLE_PLACES_API_KEY: false, ANTHROPIC_API_KEY: false };
const envPath = join(dir, ".env");
const hasEnv = existsSync(envPath);
if (hasEnv) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m && m[1] in keys) keys[m[1]] = m[2].trim().length > 0;
  }
}

const [db, app] = await Promise.all([portOpen(5432), portOpen(3000)]);
const node = process.versions.node;
const nodeOk = Number(node.split(".")[0]) > 22 || (Number(node.split(".")[0]) === 22 && Number(node.split(".")[1]) >= 9);
const mark = (ok) => (ok ? "yes" : "NO");

console.log(`LinkUp environment status (from .claude/hooks/session-status.mjs):
- .env file present: ${mark(hasEnv)}${hasEnv ? "" : " → run: cp .env.example .env"}
- DATABASE_URL set: ${mark(keys.DATABASE_URL)} | GOOGLE_PLACES_API_KEY set: ${mark(keys.GOOGLE_PLACES_API_KEY)} (no → demo restaurants) | ANTHROPIC_API_KEY set: ${mark(keys.ANTHROPIC_API_KEY)} (no → keyword matching)
- Postgres listening on 5432: ${mark(db)}${db ? "" : " → ask the user to run: brew services start postgresql@16"}
- App running on :3000: ${mark(app)}${app ? "" : " (start with npm run dev before npm run smoke)"}
- Node ${node}${nodeOk ? "" : " → needs 22.9+ for --env-file-if-exists"}`);
