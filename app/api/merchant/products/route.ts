import { createClientProduct, deleteClientProduct, updateClientProduct } from "../../../../db/v23";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";
import type { Product } from "../../../data/products";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string } & Partial<Pick<Product, "id" | "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "relatedSlugs" | "description" | "details">>;
    const access = await requireMerchantCapability(request, "products.write", payload.siteId);
    const { siteId: _siteId, ...input } = payload;
    void _siteId;
    return Response.json({ product: await createClientProduct(access.site.id, input, access.user!.userId, access.user!.email, true) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; productId?: string } & Partial<Pick<Product, "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "relatedSlugs" | "description" | "details">>;
    const access = await requireMerchantCapability(request, "products.write", payload.siteId);
    if (!payload.productId) throw new Error("PRODUCT_NOT_FOUND");
    const { productId, siteId: _siteId, ...patch } = payload;
    void _siteId;
    return Response.json({ product: await updateClientProduct(access.site.id, productId, patch, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; productId?: string };
    const access = await requireMerchantCapability(request, "products.write", payload.siteId);
    if (!payload.productId) throw new Error("PRODUCT_NOT_FOUND");
    return Response.json(await deleteClientProduct(access.site.id, payload.productId, access.user!.userId, access.user!.email, true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
