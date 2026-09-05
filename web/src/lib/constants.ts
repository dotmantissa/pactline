export const RPC_URL = "https://studio.genlayer.com/api";
export const CLIENT_RPC_URL = "/api/genlayer";
export const CHAIN_ID = 61999;
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS ?? "";
export const TX_POLL_INTERVAL = 3000;
export const TX_POLL_RETRIES = 120;

export const studioExplorer = (hash: string) =>
  `https://explorer-studio.genlayer.com/tx/${hash}`;

export const formatUptime = (bps: number) => `${(bps / 100).toFixed(2)}%`;
export const formatGen = (wei: number) =>
  `${(wei / 1_000_000_000_000_000_000).toFixed(3)} GEN`;

const WEI_PER_GEN = 1_000_000_000_000_000_000n;

export function parseGenAmount(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) {
    throw new Error("Enter a GEN amount with up to 18 decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * WEI_PER_GEN + BigInt(fraction.padEnd(18, "0") || "0");
}

export function formatGenWei(wei: bigint) {
  const whole = wei / WEI_PER_GEN;
  const fraction = (wei % WEI_PER_GEN).toString().padStart(18, "0").slice(0, 3);
  return `${whole}.${fraction} GEN`;
}
