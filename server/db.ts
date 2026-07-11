import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import fs from "fs";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not configured. Auth and saved route APIs will return service errors."
  );
} else if (connectionString.startsWith("jdbc:")) {
  throw new Error(
    "DATABASE_URL must be a Node/Postgres connection string, not a JDBC URL. Use postgresql://USER:PASSWORD@HOST:PORT/DATABASE instead of jdbc:postgresql://..."
  );
}

export const pool = new Pool({
  connectionString,
  ssl: {
    ca: fs.readFileSync("/home/Michi/ca.pem", "utf8"),
    rejectUnauthorized: true,
  },
});

export const db = drizzle(pool, { schema });