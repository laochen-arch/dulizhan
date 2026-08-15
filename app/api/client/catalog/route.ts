import { importClientData, previewClientImport } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; dryRun?: boolean; products?: unknown; productCsv?: string; assetBindings?: Record<string, string> };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    const input = { products: payload.products, productCsv: payload.productCsv, assetBindings: payload.assetBindings };
    if (payload.dryRun) return Response.json({ dryRun: true, ...(await previewClientImport(siteId, input, access.user.userId, access.user.email)) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(await importClientData(siteId, input, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
