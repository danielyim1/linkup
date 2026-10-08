/**
 * Explain a room's deck from the local database.
 *   npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts            # latest room
 *   npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts ABCDE       # a specific room
 *   npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts ABCDE sushi # one restaurant
 *   npx tsx --env-file-if-exists=.env .claude/skills/debug-deck/scripts/explain-room.ts --list      # recent rooms
 * Run from the project root.
 */
import { pool } from "../../../../src/server/db";
import { explainRoom, latestRoomCode, listRooms } from "../../../../src/server/debug/deck-report";

const [first, ...rest] = process.argv.slice(2);
try {
  if (first === "--list") {
    console.log(await listRooms(10));
  } else {
    const code = first && first !== "latest" ? first : await latestRoomCode();
    if (!code) console.log("No rooms in the database yet.");
    else console.log(await explainRoom(code, { name: rest.join(" ") || undefined, limit: 8 }));
  }
} catch (e) {
  console.error("Couldn't read the database:", e instanceof Error ? e.message : e, "\nIs Postgres running and DATABASE_URL set in .env?");
  process.exitCode = 1;
} finally {
  await pool.end();
}
