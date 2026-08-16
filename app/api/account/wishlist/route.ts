import { accountErrorResponse, getAccountContext } from "../helpers";
import { addCustomerWishlist, listCustomerWishlist, removeCustomerWishlist } from "../../../../db/v26";

export const dynamic = "force-dynamic";

function productIdFromPayload(payload: unknown) {
  const productId = typeof payload === "object" && payload !== null && "productId" in payload ? String((payload as { productId?: unknown }).productId || "").trim() : "";
  if (!productId || productId.length > 160) throw new Error("PRODUCT_NOT_FOUND");
  return productId;
}

export async function GET(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    return Response.json({ items: await listCustomerWishlist(site.id, user.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    const productId = productIdFromPayload(await request.json().catch(() => ({})));
    return Response.json({ items: await addCustomerWishlist(site.id, user.userId, productId) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    const productId = productIdFromPayload({ productId: new URL(request.url).searchParams.get("productId") });
    return Response.json({ items: await removeCustomerWishlist(site.id, user.userId, productId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
