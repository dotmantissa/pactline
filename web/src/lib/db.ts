import { Pool } from "pg";

let pool: Pool | undefined;

export function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  pool ??= new Pool({
    connectionString,
    max: 3,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}
