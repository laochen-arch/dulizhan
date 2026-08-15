import { updateClientProduct } from "../../../../db/v23";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";
import type { Product } from "../../../data/products";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; productId?: string } & Partial<Pick<Product, "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "relatedSlugs" | "description" | "details">>;
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.productId) throw new Error("PRODUCT_NOT_FOUND");
    const { productId, siteId: _siteId, ...patch } = payload;
    void _siteId;
    return Response.json({ product: await updateClientProduct(siteId, productId, patch, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
