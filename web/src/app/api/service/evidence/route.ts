import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const agreementId = params.get("agreement_id");
    const periodStart = params.get("period_start");
    if (!agreementId || !periodStart) {
      return NextResponse.json(
        { error: "agreement_id and period_start are required" },
        { status: 400 },
      );
    }
    const result = await database().query(
      `select snapshot_id, agreement_id, period_start, period_end,
              uptime_bps, total_checks, failed_checks, signature
       from monitor_snapshots
       where agreement_id = $1 and period_start = $2
       limit 1`,
      [agreementId, periodStart],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evidence unavailable" },
      { status: 503 },
    );
  }
}
