# LinkUp's Claude Code setup: a guide

These files teach an AI coding assistant (Claude Code) how to work on LinkUp. They don't change the app. Your friends never see them. They change how well the AI helps you build it.

To use them, install Claude Code, then run `claude` inside the `linkup` folder. Everything here loads automatically.

```
linkup/
├── CLAUDE.md                        ← 1. Memory: always loaded
├── .mcp.json                        ← 4. MCP: connects Claude to your database
├── mcp/linkup-db.ts                 ←    …the MCP server itself
└── .claude/
    ├── settings.json                ← 5. Hooks + permissions
    ├── hooks/
    │   ├── session-status.mjs       ←    runs when a session starts
    │   ├── protect-secrets.mjs      ←    runs before every read/edit/command
    │   └── typecheck-after-edit.mjs ←    runs after every edit
    ├── skills/                      ← 2. Skills: loaded only when needed
    │   ├── check-everything/        ←    /check-everything
    │   ├── debug-deck/              ←    /debug-deck
    │   └── add-food-word/           ←    /add-food-word
    └── agents/                      ← 3. Subagents: helpers with their own context
        ├── privacy-reviewer.md
        └── ranking-evaluator.md
```

## 1. `CLAUDE.md`: the briefing note

**Loaded:** at the start of every session, in full. **Use for:** short facts that are true in every conversation.

It covers what LinkUp is, how to run it, where the code lives, and the rules that must never break (votes are private, keys stay on the server). Without it, Claude rediscovers the project from scratch every session and might "fix" something by breaking vote privacy.

**Keep it short.** Every line costs space in every session. Procedures belong in skills.

## 2. Skills: manuals on the shelf

**Loaded:** only the name and description at first. The full instructions load when needed. **Use for:** step-by-step procedures you sometimes need.

| Skill | Type it as | What it does | Script inside |
|---|---|---|---|
| check-everything | `/check-everything` | Typecheck → parser eval → deck eval → smoke test, stops at first failure | `scripts/check.sh` (also: `npm run check`) |
| debug-deck | `/debug-deck ABCDE sushi` | Shows why each card has its score, point by point | `scripts/explain-room.ts` |
| add-food-word | `/add-food-word birria` | Adds a cuisine/mood to `cuisines.ts` + an eval case, then proves it works | none (uses npm scripts) |

Claude also picks a skill on its own when your request matches its `description`. Saying "why did a taco place show up?" triggers debug-deck. That's why descriptions say *when* to use the skill.

You can run the scripts yourself too:
```bash
npm run check
npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts --list
npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts ABCDE
```

## 3. Subagents: assistants with their own desk

**Loaded:** only when Claude delegates a task to them. They work in a separate context and send back a summary. **Use for:** focused jobs where you want the conclusion, not all the reading.

- **privacy-reviewer** is read-only (Read/Grep/Glob, no editing). It traces data from the database to every socket message and API response and reports PASS or the exact leak. CLAUDE.md tells Claude to use it after changing socket or snapshot code.
- **ranking-evaluator** runs the parser eval, the deck eval (rules vs Claude), and fixed ranking scenarios ("expensive asian food" should put $$$+ Asian on top, and so on) and reports what got better or worse. It doesn't edit code, so it can't grade its own homework.

Ask for one directly: *"use the ranking-evaluator to check my change"*.

## 4. MCP: plugging Claude into your database

**Loaded:** tool names only. Details load on demand. **Use for:** reaching systems outside your files.

`mcp/linkup-db.ts` is a small program (~100 lines) that gives Claude three tools:
- `list_rooms`: recent rooms
- `explain_deck`: the same breakdown as the debug-deck skill
- `query`: read-only SQL

So you can ask *"look at my last room and tell me why there's no sushi"*, and Claude checks the real data instead of guessing.

It's deliberately safe. Every query runs in a read-only transaction with a 5-second limit, it can't read participant login tokens, and it never touches API keys. The first time, Claude Code asks you to approve this server. That's normal for project MCP servers.

Read `mcp/linkup-db.ts`: it's the clearest way to see what an MCP server really is. It's a regular program that describes its tools and answers calls.

## 5. Hooks: rules that always run

**Loaded:** never. Hooks are scripts Claude Code runs automatically, not instructions Claude reads, so they work even if the AI forgets. **Use for:** anything that must happen every single time.

| Hook | When | What |
|---|---|---|
| `session-status.mjs` | session start | Tells Claude: is Postgres running? Is the app running? Which keys are **set** (never their values)? |
| `protect-secrets.mjs` | before every Read/Edit/Write/Grep/Bash | Blocks anything that would read or print `.env` (`cat .env`, `printenv`, `echo $ANTHROPIC_API_KEY`…). Loading `.env` into the app is still allowed. |
| `typecheck-after-edit.mjs` | after every edit of a `.ts`/`.tsx` file | Runs TypeScript. If there are errors, Claude sees them immediately and fixes them before moving on. |

`settings.json` also has **permission deny rules** for `.env`, a second lock on the same door. Writing "never read .env" in CLAUDE.md is a request. The hook and deny rules are enforcement.

## Which one do I reach for?

| You want… | Use |
|---|---|
| Claude to always know a fact | a line in `CLAUDE.md` |
| a repeatable procedure | a skill (add a script if it involves commands) |
| a second opinion, or messy legwork kept out of your conversation | a subagent |
| Claude to see something outside your files (DB, GitHub, a browser) | an MCP server |
| something to happen every time, no exceptions | a hook |
