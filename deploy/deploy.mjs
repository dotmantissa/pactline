import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), quiet: true });

const key = process.env.DEPLOYER_KEY?.trim();
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error("DEPLOYER_KEY must be a 32 byte private key");
}
const code = await readFile(resolve(root, "contracts/Pactline.py"), "utf8");
const runner = code.match(/"Depends":\s*"([^"]+)"/)?.[1];
if (!runner || runner.includes(":latest") || runner.includes(":test")) {
  throw new Error("Pactline.py must use a pinned GenVM runner");
}

const account = createAccount(key);
const client = createClient({
  chain: studionet,
  account,
  endpoint: process.env.STUDIO_RPC?.trim() || "https://studio.genlayer.com/api",
});
console.log(`Deploying Pactline from ${account.address} on studionet`);
const txHash = await client.deployContract({ code, args: [] });
console.log(`Deployment transaction: ${txHash}`);
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  interval: 3000,
  retries: 200,
  fullTransaction: true,
});
if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
  throw new Error("Deployment execution finished with an error");
}
const candidates = [
  receipt.txDataDecoded?.contractAddress,
  receipt.recipient,
  receipt.to_address,
  receipt.to,
];
const address = candidates.find(
  (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
);
if (!address) throw new Error("Deployment receipt did not contain a contract address");
const schema = await client.getContractSchema(address);
const deployedCode = await client.getContractCode(address);
const counts = await client.readContract({
  address,
  functionName: "get_counts",
  args: [],
  jsonSafeReturn: true,
});
const sourceSha256 = createHash("sha256").update(code).digest("hex");
const deployedSha256 = createHash("sha256").update(String(deployedCode)).digest("hex");
if (sourceSha256 !== deployedSha256) throw new Error("Deployed source hash does not match local source");
const metadata = {
  network: "studionet",
  contractName: "Pactline",
  contractAddress: address,
  deployerAddress: account.address,
  deploymentTransaction: txHash,
  deployedAt: new Date().toISOString(),
  runner,
  sourceSha256,
  counts: JSON.parse(String(counts)),
  schemaMethods: Object.keys(schema?.methods ?? {}).sort(),
};
await mkdir(resolve(root, "deploy"), { recursive: true });
await writeFile(resolve(root, "deploy/addresses.json"), `${JSON.stringify(metadata, null, 2)}\n`);

async function updateEnv(path, values) {
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {}
  const lines = text.split(/\r?\n/);
  for (const [name, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    if (index >= 0) lines[index] = `${name}=${value}`;
    else lines.push(`${name}=${value}`);
  }
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${lines.filter(Boolean).join("\n")}\n`, { mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}
await updateEnv(resolve(root, ".env"), { CONTRACT_ADDRESS: address });
await mkdir(resolve(root, "web"), { recursive: true });
await updateEnv(resolve(root, "web/.env.local"), {
  NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS: address,
});
console.log(`Pactline deployed at ${address}`);
