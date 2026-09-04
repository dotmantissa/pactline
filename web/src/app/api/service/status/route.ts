import { NextResponse } from "next/server";
import { database } from "@/lib/db";
import { serviceState } from "@/lib/service";

export async function GET() {
  try {
    const state = await serviceState();
    const checks = await database().query<{
      total: string;
      failed: string;
      last_checked_at: string | null;
    }>(
      `select count(*)::text as total,
              count(*) filter (where not ok)::text as failed,
              max(checked_at)::text as last_checked_at
       from service_checks
       where checked_at > now() - interval '24 hours'`,
    );
    const row = checks.rows[0];
    const total = Number(row?.total ?? 0);
    const failed = Number(row?.failed ?? 0);
    const uptimeBps = total ? Math.floor(((total - failed) * 10000) / total) : 10000;
    return NextResponse.json({
      ...state,
      total_checks: total,
      failed_checks: failed,
      uptime_bps: uptimeBps,
      last_checked_at: row?.last_checked_at ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}
