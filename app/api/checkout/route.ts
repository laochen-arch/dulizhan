import { createCheckout, checkoutErrorCode, type CheckoutPayload } from "../../../db/commerce";
import { resolveSiteByHost } from "../../../db/cms";
import { subscribeToNewsletter } from "../../../db/v28";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as CheckoutPayload;
    const site = await resolveSiteByHost(request.headers.get("host"));
    const idempotencyKey = request.headers.get("x-idempotency-key") || "";
    const user = await getChatGPTUser();
    const result = await createCheckout(site.id, payload, new URL(request.url).origin, idempotencyKey, user?.userId);
    if (payload.newsletterOptIn) void subscribeToNewsletter(site.id, payload.email || "", "checkout").catch(() => undefined);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = checkoutErrorCode(error);
    const status = ["PAYMENT_NOT_CONFIGURED", "CMS_SECRETS_NOT_CONFIGURED", "CMS_SECRETS_INVALID"].includes(code) ? 503 : ["STOCK_UNAVAILABLE", "PRODUCT_UNAVAILABLE"].includes(code) ? 409 : 400;
    const messages: Record<string, string> = { PAYMENT_NOT_CONFIGURED: "Payments are not configured for this storefront yet.", CMS_SECRETS_NOT_CONFIGURED: "The storefront payment configuration needs CMS_SECRETS_KEY before checkout can start.", CMS_SECRETS_INVALID: "The storefront payment configuration cannot be decrypted. Re-save the provider credentials with the current CMS_SECRETS_KEY.", STOCK_UNAVAILABLE: "One or more items are no longer available in the requested quantity.", PRODUCT_UNAVAILABLE: "One or more products are no longer available.", INVALID_CHECKOUT: "Check the checkout fields and cart items before continuing.", PAYMENT_CAPTURE_NOT_CONFIRMED: "PayPal has not confirmed the capture yet. Your order remains pending while we reconcile it.", PAYMENT_PROVIDER_ERROR: "PayPal rejected the checkout request. Check the Sandbox/Live mode and PayPal app credentials." };
    return Response.json({ error: messages[code] || "Unable to start checkout.", code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
