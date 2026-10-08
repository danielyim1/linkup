---
name: check-everything
description: Run every LinkUp check (typecheck, wish-parser eval, ranking demo, end-to-end smoke test) and report results. Use before saying a change is done, after editing server or ranking code, or when the user asks "does everything still work?".
allowed-tools: Bash(bash .claude/skills/check-everything/scripts/check.sh)
---

# Check everything

Run the full check script from the project root:

```bash
bash .claude/skills/check-everything/scripts/check.sh
```

It runs, in order, and stops at the first failure:
1. `tsc --noEmit`: type errors
2. `npm run eval:prefs -- --basic`: the keyword wish parser on all test wishes (free, no API calls)
3. `npm run eval:deck`: 8 group scenarios with automatic checks on the rule-ordered deck (free). Report the score; a drop from before is a regression.
4. `npm run smoke`: three simulated friends create, join, wish, swipe, and match. Starts the app temporarily if it isn't running. Needs Postgres.

## Reporting

- All passed → say so in one line.
- Something failed → show the failing lines, explain the cause in plain words, fix it, and run the script again.
- Don't run the Claude-powered evals (`npm run eval:prefs` without `--basic`, `npm run eval:deck -- --ai`) unless the user asks. They make paid API calls.
