import { config } from "dotenv";
import { database } from "../src/lib/db";

config({ path: ".env.local", quiet: true });

const pool = database();
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
    service_id text,
    agreement_id text,
    period_start timestamptz not null,
    period_end timestamptz not null,
    uptime_bps integer not null,
    total_checks integer not null,
    failed_checks integer not null,
    evidence_url text not null,
    signature text not null,
    created_at timestamptz not null default now()
  );
  alter table monitor_snapshots add column if not exists service_id text;
  update monitor_snapshots
  set service_id = agreement_id
  where service_id is null and agreement_id is not null;
  create table if not exists wallet_drips (
    wallet_address text primary key,
    amount_wei numeric not null,
    tx_hash text,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  );
`);
await pool.end();
console.log("Pactline database is ready.");
