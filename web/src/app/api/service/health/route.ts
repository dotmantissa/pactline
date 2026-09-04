import { NextResponse } from "next/server";
import { recordCheck, serviceState } from "@/lib/service";

export async function GET() {
  try {
    const state = await serviceState();
    const ok = state.enabled && !state.outage;
    await recordCheck(ok, "public health check");
    return NextResponse.json(
      {
        service: "Pactline Demo API",
        ok,
        checked_at: new Date().toISOString(),
        response_ms: ok ? 42 : null,
      },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Service unavailable" },
      { status: 503 },
    );
  }
}
