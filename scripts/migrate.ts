import { migrate, pool } from "../src/server/db";

await migrate();
console.log("✓ schema applied");
await pool.end();
