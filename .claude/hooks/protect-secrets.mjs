#!/usr/bin/env node
/**
 * HOOK: PreToolUse (runs BEFORE Claude reads, edits, searches, or runs a command)
 *
 * Job: keep the real API keys in .env away from the AI.
 * The deny rules in settings.json already block Read/Edit of .env; this hook also
 * catches shell commands (cat .env, grep KEY .env, source .env, printenv) and searches.
 *
 * How hooks talk to Claude Code:
 *   - The tool call arrives as JSON on stdin.
 *   - exit 0  → allow (normal permission rules still apply)
 *   - exit 2  → block; whatever we print to stderr is shown to Claude as the reason.
 */
import { basename } from "node:path";

const input = JSON.parse(await new Promise((resolve) => {
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => resolve(data || "{}"));
}));

const tool = input.tool_name;
const ti = input.tool_input ?? {};

// .env, .env.local, .env.production… but NOT .env.example (that one has no secrets).
const isSecretFile = (p) => {
  if (!p) return false;
  const name = basename(String(p));
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
};
const mentionsSecretFile = (text) => /(^|[\s'"=<>|;&(/])\.env(\.(?!example)\w+)?(?=$|[\s'";|&)>])/.test(String(text));

function block(reason) {
  console.error(
    `Blocked by .claude/hooks/protect-secrets.mjs: ${reason}\n` +
      "The .env file holds the user's real API keys and must not be read or printed. " +
      "To check whether keys are set, use the session status (it reports set/missing without values), " +
      "or ask the user to check the app's startup lines.",
  );
  process.exit(2);
}

if (["Read", "Edit", "Write"].includes(tool) && isSecretFile(ti.file_path)) block(`${tool} on ${ti.file_path}`);
if (tool === "Grep" && (isSecretFile(ti.path) || mentionsSecretFile(ti.glob ?? ""))) block("searching inside .env");
if (tool === "Bash") {
  // Loading .env into a program (how our npm scripts start the app) is fine — it doesn't print anything.
  const cmd = String(ti.command ?? "").replace(/--env-file(-if-exists)?=\.env\b/g, "");
  if (mentionsSecretFile(cmd)) block(`command touches .env: ${cmd.slice(0, 80)}`);
  if (/\b(printenv|env)\b\s*($|\|)/.test(cmd) || /\bset\s*$/.test(cmd)) block("printing all environment variables could expose keys");
  if (/\$\{?(ANTHROPIC_API_KEY|GOOGLE_PLACES_API_KEY)\b/.test(cmd)) block("command references an API key variable");
}

process.exit(0);
