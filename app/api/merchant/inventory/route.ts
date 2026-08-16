import { listInventory, updateInventory } from "../../../../db/commerce";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "inventory.read");
    return Response.json({ inventory: await listInventory(access.site.id, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; productId?: string; variantId?: string; quantity?: number };
    const access = await requireMerchantCapability(request, "inventory.write", payload.siteId);
    if (!payload.productId || !payload.variantId || typeof payload.quantity !== "number") throw new Error("INVALID_INVENTORY");
    return Response.json({ inventory: await updateInventory(access.site.id, payload.productId, payload.variantId, payload.quantity, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
