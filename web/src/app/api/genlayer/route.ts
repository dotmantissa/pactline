const STUDIO_RPC_URL = "https://studio.genlayer.com/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = await fetch(STUDIO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
