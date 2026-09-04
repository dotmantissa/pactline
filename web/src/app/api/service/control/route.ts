import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { outage?: boolean };
    if (typeof body.outage !== "boolean") {
      return NextResponse.json({ error: "outage must be boolean" }, { status: 400 });
    }
    const result = await database().query(
      `update service_state
       set outage = $1, updated_at = now()
       where id = 1
       returning enabled, outage, updated_at`,
      [body.outage],
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update service" },
      { status: 503 },
    );
  }
}
