#!/usr/bin/env bash
# Runs every LinkUp check in order and stops at the first failure.
#   bash .claude/skills/check-everything/scripts/check.sh
# Run from the project root. Starts the app temporarily if it isn't already running.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 1

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null; exit 1; }

step "1/4 TypeScript"
npx tsc --noEmit --pretty false || fail "TypeScript errors (see above)"
echo "ok"

step "2/4 Wish parser eval (keyword fallback — free, no API calls)"
npm run -s eval:prefs -- --basic | tail -n 3 || fail "eval crashed"
npm run -s eval:prefs -- --basic | grep -q "✗" && fail "some eval cases failed — run: npm run eval:prefs -- --basic"

step "3/4 Deck eval (rules order — free)"
npm run -s eval:deck | tail -n 2 || fail "deck eval crashed"

step "4/4 End-to-end smoke test"
if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then fail "Postgres isn't running (brew services start postgresql@16)"; fi
if (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
  echo "using the app already running on :3000"
else
  echo "starting the app temporarily…"
  npx tsx --env-file-if-exists=.env server.ts > /tmp/linkup-check.log 2>&1 &
  APP_PID=$!
  for _ in $(seq 1 60); do (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && break; sleep 1; done
  (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null || fail "app didn't start — see /tmp/linkup-check.log"
fi
npm run -s smoke | tail -n 4
SMOKE=${PIPESTATUS[0]}
[ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
[ "$SMOKE" -eq 0 ] || fail "smoke test failed"

printf '\n\033[32m✓ All checks passed\033[0m\n'
