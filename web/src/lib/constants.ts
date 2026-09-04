export const RPC_URL = "https://studio.genlayer.com/api";
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
