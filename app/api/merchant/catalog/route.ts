import { importClientData, previewClientImport } from "../../../../db/cms";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; dryRun?: boolean; products?: unknown; productCsv?: string; assetBindings?: Record<string, string> };
    const access = await requireMerchantCapability(request, "products.write", payload.siteId);
    const input = { products: payload.products, productCsv: payload.productCsv, assetBindings: payload.assetBindings };
    if (payload.dryRun) return Response.json({ dryRun: true, ...(await previewClientImport(access.site.id, input, access.user!.userId, access.user!.email, true)) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(await importClientData(access.site.id, input, access.user!.userId, access.user!.email, true), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
