import { retryPayPalCheckout } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { orderId?: string; paypalOrderId?: string };
    if (!payload.orderId || !payload.paypalOrderId) return Response.json({ error: "Order details are required." }, { status: 400 });
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json(await retryPayPalCheckout(site.id, payload.orderId, payload.paypalOrderId, new URL(request.url).origin), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHECKOUT_RETRY_FAILED";
    const message = code === "STOCK_UNAVAILABLE" ? "Some items are no longer available." : code === "ORDER_ALREADY_PAID" ? "This order is already paid." : "Unable to restart PayPal checkout.";
    return Response.json({ error: message, code }, { status: code === "STOCK_UNAVAILABLE" ? 409 : 400 });
  }
}
