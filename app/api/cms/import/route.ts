import { importClientData, previewClientImport } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; dryRun?: boolean; config?: unknown; products?: unknown; productCsv?: string; assetBindings?: Record<string, string> };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    const importPayload = { config: payload.config, products: payload.products, productCsv: payload.productCsv, assetBindings: payload.assetBindings };
    if (payload.dryRun) return Response.json({ dryRun: true, ...(await previewClientImport(siteId, importPayload, access.user.userId, access.user.email)) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json(await importClientData(siteId, importPayload, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
