import { listInventory, updateInventory } from "../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    return Response.json({ inventory: await listInventory(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; productId?: string; variantId?: string; quantity?: number };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.productId || !payload.variantId || typeof payload.quantity !== "number") return Response.json({ error: "productId, variantId and quantity are required.", code: "INVALID_INVENTORY" }, { status: 400 });
    return Response.json({ inventory: await updateInventory(siteId, payload.productId, payload.variantId, payload.quantity, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
