import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await pool.query(`
  create table if not exists service_state (
    id integer primary key,
    enabled boolean not null default true,
    outage boolean not null default false,
    updated_at timestamptz not null default now()
  );
  insert into service_state (id, enabled, outage)
  values (1, true, false)
  on conflict (id) do nothing;
  create table if not exists service_checks (
    id bigserial primary key,
    checked_at timestamptz not null default now(),
    ok boolean not null,
    source text not null
  );
  create table if not exists monitor_snapshots (
    id bigserial primary key,
    snapshot_id text not null unique,
    agreement_id text not null,
    period_start timestamptz not null,
    period_end timestamptz not null,
    uptime_bps integer not null,
    total_checks integer not null,
    failed_checks integer not null,
    evidence_url text not null,
    signature text not null,
    created_at timestamptz not null default now()
  );
`);
await pool.end();
console.log("Pactline database is ready.");
