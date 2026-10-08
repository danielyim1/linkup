import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const g = globalThis as unknown as { __linkupPool?: pg.Pool };

export const pool: pg.Pool =
  g.__linkupPool ??
  (g.__linkupPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/linkup",
    max: 10,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  }));

export async function migrate() {
  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
}

export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
