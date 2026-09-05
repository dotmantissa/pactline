import { NextResponse } from "next/server";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { database } from "@/lib/db";

const STUDIO_RPC_URL = "https://studio.genlayer.com/api";
const DRIP_AMOUNT_WEI = 1_000n * 1_000_000_000_000_000_000n;

export const dynamic = "force-dynamic";

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: unknown };
    if (!isAddress(body.address)) {
      return NextResponse.json({ error: "A valid embedded wallet address is required." }, { status: 400 });
    }

    const address = body.address.toLowerCase();
    const pool = database();
    await pool.query(`
      create table if not exists wallet_drips (
        wallet_address text primary key,
        amount_wei numeric not null,
        tx_hash text,
        status text not null default 'pending',
        created_at timestamptz not null default now()
      )
    `);

    const existing = await pool.query<{ amount_wei: string; tx_hash: string | null; status: string }>(
      "select amount_wei, tx_hash, status from wallet_drips where wallet_address = $1",
      [address],
    );
    if (existing.rows[0]) {
      return NextResponse.json({
        status: existing.rows[0].status === "complete" ? "already_dripped" : "pending",
        amount_wei: existing.rows[0].amount_wei,
        tx_hash: existing.rows[0].tx_hash,
      });
    }

    const faucetKey = process.env.FAUCET_PRIVATE_KEY?.trim();
    if (!faucetKey || !/^0x[0-9a-fA-F]{64}$/.test(faucetKey)) {
      return NextResponse.json({ error: "The starter balance is not configured yet." }, { status: 503 });
    }

    const reservation = await pool.query(
      `insert into wallet_drips (wallet_address, amount_wei, status)
       values ($1, $2, 'pending')
       on conflict (wallet_address) do nothing
       returning wallet_address`,
      [address, DRIP_AMOUNT_WEI.toString()],
    );
    if (!reservation.rows[0]) {
      const raced = await pool.query<{ amount_wei: string; tx_hash: string | null; status: string }>(
        "select amount_wei, tx_hash, status from wallet_drips where wallet_address = $1",
        [address],
      );
      return NextResponse.json({
        status: raced.rows[0]?.status === "complete" ? "already_dripped" : "pending",
        amount_wei: raced.rows[0]?.amount_wei ?? DRIP_AMOUNT_WEI.toString(),
        tx_hash: raced.rows[0]?.tx_hash ?? null,
      });
    }

    try {
      const faucet = createAccount(faucetKey as `0x${string}`);
      if (faucet.address.toLowerCase() === address) {
        throw new Error("The faucet wallet cannot receive its own starter balance.");
      }
      const client = createClient({
        chain: studionet,
        account: faucet,
        endpoint: STUDIO_RPC_URL,
      });
      const txHash = await client.sendTransaction({
        account: faucet,
        to: address as `0x${string}`,
        value: DRIP_AMOUNT_WEI,
      });
      await pool.query(
        "update wallet_drips set tx_hash = $1, status = 'complete' where wallet_address = $2",
        [txHash, address],
      );
      return NextResponse.json({
        status: "dripped",
        amount_wei: DRIP_AMOUNT_WEI.toString(),
        tx_hash: txHash,
      });
    } catch (error) {
      await pool.query("delete from wallet_drips where wallet_address = $1 and status = 'pending'", [address]);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The starter balance could not be added." },
      { status: 503 },
    );
  }
}
