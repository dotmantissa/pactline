import { createHmac } from "node:crypto";
import { database } from "@/lib/db";

export type ServiceState = {
  enabled: boolean;
  outage: boolean;
  updated_at: string;
};

export async function serviceState(): Promise<ServiceState> {
  const result = await database().query<ServiceState>(
    "select enabled, outage, updated_at from service_state where id = 1",
  );
  if (!result.rows[0]) {
    await database().query(
      "insert into service_state (id, enabled, outage) values (1, true, false) on conflict (id) do nothing",
    );
    return { enabled: true, outage: false, updated_at: new Date().toISOString() };
  }
  return result.rows[0];
}

export async function recordCheck(ok: boolean, source: string) {
  await database().query(
    "insert into service_checks (ok, source) values ($1, $2)",
    [ok, source],
  );
}

export function signSnapshot(payload: object) {
  const secret = process.env.PUBLISHER_SECRET;
  if (!secret) throw new Error("PUBLISHER_SECRET is not configured");
  return createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}
