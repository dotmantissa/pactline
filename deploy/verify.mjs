import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), quiet: true });
const metadata = JSON.parse(await readFile(resolve(root, "deploy/addresses.json"), "utf8"));
const address = metadata.contractAddress;
const client = createClient({
  chain: studionet,
  endpoint: process.env.STUDIO_RPC?.trim() || "https://studio.genlayer.com/api",
});
const source = await readFile(resolve(root, "contracts/Pactline.py"), "utf8");
const [schema, deployedCode, counts, agreements, snapshots, claims] = await Promise.all([
  client.getContractSchema(address),
  client.getContractCode(address),
  client.readContract({ address, functionName: "get_counts", args: [], jsonSafeReturn: true }),
  client.readContract({ address, functionName: "get_agreements", args: [], jsonSafeReturn: true }),
  client.readContract({ address, functionName: "get_snapshots", args: [], jsonSafeReturn: true }),
  client.readContract({ address, functionName: "get_claims", args: [], jsonSafeReturn: true }),
]);
const localHash = createHash("sha256").update(source).digest("hex");
const deployedHash = createHash("sha256").update(String(deployedCode)).digest("hex");
if (localHash !== deployedHash || localHash !== metadata.sourceSha256) {
  throw new Error("Local, deployed, and recorded source hashes differ");
}
const expected = [
  "file_claim",
  "get_agreement",
  "get_agreements",
  "get_claim",
  "get_claims",
  "get_counts",
  "get_snapshot",
  "get_snapshots",
  "pause_sla",
  "publish_snapshot",
  "register_sla",
  "set_monitor_operator",
].sort();
const actual = Object.keys(schema.methods ?? {}).sort();
if (JSON.stringify(expected) !== JSON.stringify(actual)) {
  throw new Error(`Unexpected schema methods: ${actual.join(", ")}`);
}
console.log(`Verified Pactline at ${address}`);
console.log(`Counts: ${counts}`);
console.log(`Agreements: ${agreements}`);
console.log(`Snapshots: ${snapshots}`);
console.log(`Claims: ${claims}`);
