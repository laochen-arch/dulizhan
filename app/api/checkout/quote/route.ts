import { checkoutErrorCode, getCheckoutQuote, type CheckoutQuotePayload } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as CheckoutQuotePayload;
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json({ quote: await getCheckoutQuote(site.id, payload) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = checkoutErrorCode(error);
    const status = ["STOCK_UNAVAILABLE", "PRODUCT_UNAVAILABLE"].includes(code) ? 409 : 400;
    const messages: Record<string, string> = { STOCK_UNAVAILABLE: "One or more items are no longer available in the requested quantity.", PRODUCT_UNAVAILABLE: "One or more products are no longer available.", INVALID_CHECKOUT: "Your bag needs to be refreshed before checkout." };
    return Response.json({ error: messages[code] || "Unable to calculate checkout total.", code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
