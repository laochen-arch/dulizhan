import { capturePayPalOrder, checkoutErrorCode } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { orderId?: string; paypalOrderId?: string };
    if (!payload.orderId || !payload.paypalOrderId) return Response.json({ error: "orderId and paypalOrderId are required.", code: "INVALID_CHECKOUT" }, { status: 400 });
    const site = await resolveSiteByHost(request.headers.get("host"));
    const status = await capturePayPalOrder(site.id, payload.orderId, payload.paypalOrderId);
    return Response.json({ ok: true, status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = checkoutErrorCode(error);
    const status = code === "PAYMENT_NOT_CONFIGURED" ? 503 : code === "ORDER_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: code === "PAYMENT_NOT_CONFIGURED" ? "PayPal is not configured for this storefront yet." : "Unable to capture the PayPal payment.", code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
