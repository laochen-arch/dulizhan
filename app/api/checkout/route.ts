import { createCheckout, checkoutErrorCode, type CheckoutPayload } from "../../../db/commerce";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as CheckoutPayload;
    const site = await resolveSiteByHost(request.headers.get("host"));
    const result = await createCheckout(site.id, payload, new URL(request.url).origin);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = checkoutErrorCode(error);
    const status = code === "PAYMENT_NOT_CONFIGURED" ? 503 : ["STOCK_UNAVAILABLE", "PRODUCT_UNAVAILABLE"].includes(code) ? 409 : 400;
    const messages: Record<string, string> = { PAYMENT_NOT_CONFIGURED: "Payments are not configured for this storefront yet.", STOCK_UNAVAILABLE: "One or more items are no longer available in the requested quantity.", PRODUCT_UNAVAILABLE: "One or more products are no longer available.", INVALID_CHECKOUT: "Check the checkout fields and cart items before continuing.", PAYMENT_PROVIDER_ERROR: "The payment provider could not start checkout." };
    return Response.json({ error: messages[code] || "Unable to start checkout.", code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
