import { createAfterSalesRequest } from "../../../../db/v21";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const site = await resolveSiteByHost(request.headers.get("host"));
    const payload = await request.json() as { orderNumber?: string; email?: string; requestType?: string; reason?: string; customerNote?: string; requestedAmount?: number; items?: Array<{ productId: string; variantId: string; quantity: number }> };
    return Response.json({ request: await createAfterSalesRequest(site.id, { orderNumber: payload.orderNumber || "", email: payload.email || "", requestType: payload.requestType || "return", reason: payload.reason || "", customerNote: payload.customerNote, requestedAmount: payload.requestedAmount, items: payload.items }) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit the request.";
    return Response.json({ error: message === "ORDER_NOT_FOUND" ? "We could not verify this paid order." : "Unable to submit the after-sales request." }, { status: message === "ORDER_NOT_FOUND" ? 404 : 400 });
  }
}
