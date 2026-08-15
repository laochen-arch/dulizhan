import { createPreviewShare } from "../../../../db/v24";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; hours?: number };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    const share = await createPreviewShare(siteId, payload.hours, access.user.userId, access.user.email);
    const url = new URL(`/preview?siteId=${encodeURIComponent(siteId)}&share=${encodeURIComponent(share.token)}`, request.url).toString();
    return Response.json({ ...share, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
