import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://fulfillmenty:fulfillmenty_dev_only@127.0.0.1:5432/fulfillmenty",
});
const migrationsDir = fileURLToPath(new URL("../drizzle/", import.meta.url));

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS fulfillmenty_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const exists = await pool.query("SELECT 1 FROM fulfillmenty_migrations WHERE name = $1", [name]);
    if (exists.rowCount) continue;
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO fulfillmenty_migrations(name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.info(`Applied database migration ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
