import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { Pool } from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), quiet: true });
config({ path: resolve(root, "web/.env.local"), quiet: true });

const rpc = process.env.GENLAYER_RPC ?? "https://studio.genlayer.com/api";
const contractAddress = process.env.CONTRACT_ADDRESS ?? process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS;
const privateKey = process.env.MONITOR_PRIVATE_KEY ?? process.env.DEPLOYER_KEY;
const databaseUrl = process.env.DATABASE_URL;
const serviceUrl = process.env.PUBLIC_SERVICE_URL;
const publicEvidenceBase = process.env.PUBLIC_EVIDENCE_BASE_URL?.replace(/\/$/, "");
const secret = process.env.PUBLISHER_SECRET;

if (!contractAddress || !privateKey || !databaseUrl || !serviceUrl || !secret) {
  throw new Error(
    "CONTRACT_ADDRESS, MONITOR_PRIVATE_KEY, DATABASE_URL, PUBLIC_SERVICE_URL, and PUBLISHER_SECRET are required",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
const account = createAccount(
  (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`,
);
const client = createClient({ chain: studionet, account, endpoint: rpc });

type Service = {
  service_id: string;
  service_url: string;
  status: string;
};

const checks = Number(process.env.MONITOR_CHECKS ?? 6);
const waitMs = Number(process.env.MONITOR_WAIT_MS ?? 1000);

async function checkService(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

const rawServices = await client.readContract({
  address: contractAddress as `0x${string}`,
  functionName: "get_services",
  args: [],
  jsonSafeReturn: true,
});
const services = JSON.parse(String(rawServices)) as Service[];
const now = Date.now();
const periodStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
const periodEnd = new Date(now).toISOString();

for (const service of services.filter((item) => item.status === "active")) {
  let passed = 0;
  for (let index = 0; index < checks; index += 1) {
    if (await checkService(service.service_url)) passed += 1;
    if (index < checks - 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  const totalChecks = checks;
  const failedChecks = totalChecks - passed;
  const uptimeBps = Math.floor((passed * 10000) / totalChecks);
  const unsigned = {
    service_id: service.service_id,
    period_start: periodStart,
    period_end: periodEnd,
    uptime_bps: uptimeBps,
    total_checks: totalChecks,
    failed_checks: failedChecks,
  };
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(unsigned))
    .digest("hex");
  const snapshotId = `snapshot_${createHash("sha256")
    .update(`${service.service_id}:${periodStart}`)
    .digest("hex")
    .slice(0, 48)}`;
  const evidenceUrl = publicEvidenceBase
    ? `${publicEvidenceBase}/${snapshotId}.json`
    : `${serviceUrl.replace(/\/health$/, "")}/evidence?service_id=${encodeURIComponent(
        service.service_id,
      )}&period_start=${encodeURIComponent(periodStart)}`;
  const evidencePayload = { ...unsigned, signature };
  if (publicEvidenceBase) {
    await mkdir(resolve(root, "evidence"), { recursive: true });
    await writeFile(
      resolve(root, "evidence", `${snapshotId}.json`),
      `${JSON.stringify(evidencePayload, null, 2)}\n`,
    );
  }
  const txHash = await client.writeContract({
    address: contractAddress as `0x${string}`,
    functionName: "publish_snapshot",
    args: [
      service.service_id,
      periodStart,
      periodEnd,
      BigInt(uptimeBps),
      BigInt(totalChecks),
      BigInt(failedChecks),
      evidenceUrl,
      signature,
    ],
    value: 0n,
  });
  await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    interval: 3000,
    retries: 120,
  });
  await pool.query(
    `insert into monitor_snapshots
      (snapshot_id, service_id, agreement_id, period_start, period_end, uptime_bps,
       total_checks, failed_checks, evidence_url, signature)
     values ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (snapshot_id) do update set
       uptime_bps = excluded.uptime_bps,
       total_checks = excluded.total_checks,
       failed_checks = excluded.failed_checks,
       signature = excluded.signature`,
    [
      snapshotId,
      service.service_id,
      periodStart,
      periodEnd,
      uptimeBps,
      totalChecks,
      failedChecks,
      evidenceUrl,
      signature,
    ],
  );
  console.log(
    `${service.service_url}: ${uptimeBps / 100}% uptime, ${txHash}, ${snapshotId}`,
  );
}

await pool.end();
