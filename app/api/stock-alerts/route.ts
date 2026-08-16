import { createStockAlert } from "../../../db/v28";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: string; productId?: string; variantId?: string };
    const site = await resolveSiteByHost(request.headers.get("host"));
    const result = await createStockAlert(site.id, payload.email || "", payload.productId || "", payload.variantId || "");
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "INVALID_EMAIL" ? "Enter a valid email address." : error instanceof Error && error.message === "PRODUCT_NOT_FOUND" ? "This product is no longer available." : "Unable to save the stock alert.";
    return Response.json({ error: message }, { status: 400 });
  }
}
