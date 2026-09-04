import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const serviceId = params.get("service_id") ?? params.get("agreement_id");
    const periodStart = params.get("period_start");
    if (!serviceId || !periodStart) {
      return NextResponse.json(
        { error: "service_id and period_start are required" },
        { status: 400 },
      );
    }
    const result = await database().query(
      `select snapshot_id, coalesce(service_id, agreement_id) as service_id,
              period_start, period_end,
              uptime_bps, total_checks, failed_checks, signature
       from monitor_snapshots
       where coalesce(service_id, agreement_id) = $1 and period_start = $2
       limit 1`,
      [serviceId, periodStart],
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
