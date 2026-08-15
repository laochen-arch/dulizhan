import { getPublicOrderByNumber } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { orderNumber?: string; email?: string };
    if (!payload.orderNumber?.trim() || !payload.email?.trim()) return Response.json({ error: "Order number and email are required." }, { status: 400 });
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json(await getPublicOrderByNumber(site.id, payload.orderNumber, payload.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "ORDER_NOT_FOUND" ? "We could not find an order with those details." : "Unable to look up this order right now.";
    return Response.json({ error: message }, { status: error instanceof Error && error.message === "ORDER_NOT_FOUND" ? 404 : 500 });
  }
}
