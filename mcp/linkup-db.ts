/**
 * LinkUp DB: a small, READ-ONLY MCP server for your local LinkUp database.
 *
 * What is MCP? A standard way to give an AI assistant new "tools". This file is a tiny
 * program that Claude Code starts in the background (see .mcp.json). It speaks MCP over
 * stdin/stdout, and offers Claude these tools:
 *
 *   list_rooms     recent rooms with status, people, matches
 *   explain_deck   why a room's cards are ordered the way they are (score breakdown)
 *   query          run a read-only SQL query (SELECT only, max 200 rows)
 *
 * Safety:
 *   - Every query runs in a READ ONLY transaction with a 5s timeout, so it can't change data.
 *   - Participant tokens (login secrets) can't be selected.
 *   - Only DATABASE_URL is used; API keys are never read or returned.
 *
 * Try it by hand:  npm run mcp:db   (it waits for MCP messages on stdin; Ctrl+C to quit)
 * IMPORTANT: stdout is the MCP channel, so all logging must go to stderr (console.error).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { pool } from "../src/server/db";
import { explainRoom, latestRoomCode, listRooms } from "../src/server/debug/deck-report";

const server = new McpServer({ name: "linkup-db", version: "1.0.0" });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

server.registerTool(
  "list_rooms",
  {
    title: "List recent rooms",
    description: "List the most recent LinkUp rooms: code, status (lobby/swiping), people, matches, location, and hard filters.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many rooms (default 10)") },
    annotations: { readOnlyHint: true },
  },
  async ({ limit }) => text(await listRooms(limit ?? 10)),
);

server.registerTool(
  "explain_deck",
  {
    title: "Explain a room's deck",
    description:
      "Explain why a LinkUp room's restaurant cards are in their order: everyone's wishes, the merged group preferences, and a point-by-point score breakdown per card. Use when a recommendation looks wrong.",
    inputSchema: {
      code: z.string().optional().describe("5-letter room code; omit for the latest room"),
      restaurant: z.string().optional().describe("Only explain cards whose name contains this text"),
      limit: z.number().int().min(1).max(30).optional().describe("How many top cards to explain (default 8)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ code, restaurant, limit }) => {
    const c = code ?? (await latestRoomCode());
    if (!c) return text("No rooms in the database yet.");
    return text(await explainRoom(c, { name: restaurant, limit }));
  },
);

server.registerTool(
  "query",
  {
    title: "Read-only SQL",
    description:
      "Run one read-only SQL SELECT against the LinkUp database (tables: rooms, participants, room_restaurants, votes, matches; see db/schema.sql). Returns up to 200 rows as JSON. The participants.token column is off-limits.",
    inputSchema: { sql: z.string().describe("A single SELECT (or WITH … SELECT) statement") },
    annotations: { readOnlyHint: true },
  },
  async ({ sql }) => {
    const q = sql.trim().replace(/;\s*$/, "");
    if (!/^(select|with)\b/i.test(q)) return text("Only SELECT queries are allowed.");
    if (q.includes(";")) return text("Only one statement at a time.");
    if (/\btoken\b|participants\.\*|\bselect\s+\*\s+from\s+participants\b/i.test(q))
      return text("participants.token is a login secret and can't be selected. Name the columns you need instead (id, name, wish, wish_prefs…).");
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = 5000");
      const r = await client.query(`SELECT * FROM (${q}) AS sub LIMIT 200`);
      await client.query("ROLLBACK");
      return text(`${r.rowCount} row(s)\n${JSON.stringify(r.rows, null, 2)}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      return text(`SQL error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      client.release();
    }
  },
);

await server.connect(new StdioServerTransport());
console.error("linkup-db MCP server running (read-only)");

const shutdown = async () => {
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);
