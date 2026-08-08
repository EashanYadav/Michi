import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db";

const migrationsTable = "michi.schema_migrations";
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  await pool.query("create schema if not exists michi");
  await pool.query(`
    create table if not exists ${migrationsTable} (
      id text primary key,
      applied_at timestamp not null default now()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const appliedResult = await pool.query<{ id: string }>(`select id from ${migrationsTable}`);
  const applied = new Set(appliedResult.rows.map((row) => row.id));
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("Database is already up to date.");
    return;
  }

  for (const file of pending) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into ${migrationsTable} (id) values ($1)`, [file]);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
