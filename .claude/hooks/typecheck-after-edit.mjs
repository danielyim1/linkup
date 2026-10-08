#!/usr/bin/env node
/**
 * HOOK: PostToolUse (runs AFTER Claude edits or writes a file)
 *
 * Job: catch TypeScript errors immediately, so Claude fixes them in the same turn
 * instead of you discovering them when the app crashes.
 *
 *   - Only runs for .ts / .tsx files.
 *   - exit 2 + stderr → Claude sees the errors and fixes them (the edit already happened).
 */
import { execFile } from "node:child_process";

const input = JSON.parse(await new Promise((resolve) => {
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => resolve(data || "{}"));
}));

const file = String(input.tool_input?.file_path ?? "");
if (!/\.(ts|tsx)$/.test(file) || file.includes("node_modules")) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

execFile("npx", ["tsc", "--noEmit", "--pretty", "false"], { cwd: projectDir, timeout: 110_000 }, (err, stdout, stderr) => {
  if (!err) process.exit(0); // clean
  const errors = `${stdout}${stderr}`.split("\n").filter((l) => l.includes("error TS"));
  if (!errors.length) process.exit(0); // tsc failed for another reason (e.g. not installed) — don't block work
  console.error(
    `TypeScript found ${errors.length} error(s) after editing ${file.replace(projectDir + "/", "")}:\n` +
      errors.slice(0, 15).join("\n") +
      (errors.length > 15 ? `\n…and ${errors.length - 15} more` : "") +
      "\nFix these before moving on.",
  );
  process.exit(2);
});
