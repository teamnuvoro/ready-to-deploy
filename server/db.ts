import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

export const forceInMemoryStorage =
  process.env.USE_IN_MEMORY_STORAGE?.toLowerCase() === "true";
export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL) && !forceInMemoryStorage;

let dbInstance: ReturnType<typeof drizzle> | null = null;

if (hasDatabaseUrl) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client:', err.message);
  });
  dbInstance = drizzle(pool, { schema });
} else {
  console.warn(
    "[storage] DATABASE_URL not set. Falling back to in-memory storage for this run.",
  );
}

export const db = dbInstance as ReturnType<typeof drizzle>;
