"use client";

import { createClient, chains } from "genlayer-js";
import type { Hash } from "genlayer-js/types";
import { TransactionStatus, transactionsStatusNumberToName } from "genlayer-js/types";
import { CONTRACT_ADDRESS, RPC_URL, TX_POLL_INTERVAL, TX_POLL_RETRIES } from "@/lib/constants";
import type { Agreement, Claim, Snapshot } from "@/lib/types";

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type TxResult = {
  hash: string;
  status: "finalized" | "failed" | "pending";
};

let readClient: ReturnType<typeof createClient> | undefined;

function reader() {
  readClient ??= createClient({ chain: chains.studionet, endpoint: RPC_URL });
  return readClient;
}

function selectiveProvider(provider: Provider) {
  return {
    async request({ method, params = [] }: { method: string; params?: unknown[] }) {
      if (method === "eth_sendTransaction") {
        const raw = { ...(params[0] as Record<string, unknown>) };
        const gas = raw.gas;
        delete raw.gas;
        delete raw.type;
        const signature = await provider.request({
          method: "eth_signTransaction",
          params: [{ ...raw, type: 0, gasLimit: gas }],
        });
        const response = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "eth_sendRawTransaction",
            params: [signature],
          }),
        });
        const data = (await response.json()) as { result?: string; error?: unknown };
        if (data.error) throw data.error;
        return data.result;
      }
      if (method === "eth_estimateGas") return "0x4C4B40";
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      const data = (await response.json()) as { result?: unknown; error?: unknown };
      if (data.error) throw data.error;
      return data.result;
    },
  };
}

function writer(address: string, provider: Provider) {
  return createClient({
    chain: chains.studionet,
    endpoint: RPC_URL,
    account: address as `0x${string}`,
    provider: selectiveProvider(provider) as never,
  });
}

async function waitFor(hash: Hash): Promise<TxResult> {
  for (let attempt = 0; attempt < TX_POLL_RETRIES; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL));
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_getTransactionByHash",
        params: [hash],
      }),
    });
    const data = (await response.json()) as { result?: { status?: string | number } };
    const status = data.result?.status;
    const name =
      typeof status === "number"
        ? transactionsStatusNumberToName[String(status) as keyof typeof transactionsStatusNumberToName]
        : status === "ACTIVATED"
          ? "PENDING"
          : status;
    if (name === TransactionStatus.ACCEPTED || name === TransactionStatus.FINALIZED) {
      return { hash, status: "finalized" };
    }
    if (name === TransactionStatus.CANCELED) return { hash, status: "failed" };
  }
  return { hash, status: "pending" };
}

function parse<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

export async function readAgreements(): Promise<Agreement[]> {
  if (!CONTRACT_ADDRESS) return [];
  const value = await reader().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_agreements",
    args: [],
    jsonSafeReturn: true,
  });
  return parse<Agreement[]>(value);
}

export async function readSnapshots(): Promise<Snapshot[]> {
  if (!CONTRACT_ADDRESS) return [];
  const value = await reader().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_snapshots",
    args: [],
    jsonSafeReturn: true,
  });
  return parse<Snapshot[]>(value);
}

export async function readClaims(): Promise<Claim[]> {
  if (!CONTRACT_ADDRESS) return [];
  const value = await reader().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_claims",
    args: [],
    jsonSafeReturn: true,
  });
  return parse<Claim[]>(value);
}

export async function writeContract(
  address: string,
  provider: Provider,
  functionName: string,
  args: Array<string | number | bigint>,
  value = 0n,
) {
  const txHash = await writer(address, provider).writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args,
    value,
  });
  return waitFor(txHash as Hash);
}
