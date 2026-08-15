import { importClientData } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; config?: unknown; products?: unknown; productCsv?: string; assetBindings?: Record<string, string> };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    return Response.json(await importClientData(siteId, payload, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
