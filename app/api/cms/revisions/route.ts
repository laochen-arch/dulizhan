import { listRevisions, rollbackRevision } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ revisions: await listRevisions(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; revisionId?: string };
    const siteId = getSiteId(request, payload.siteId);
    if (!payload.revisionId) return Response.json({ error: "revisionId is required.", code: "INVALID_REVISION" }, { status: 400 });
    const access = await requireMember(siteId, "editor");
    return Response.json(await rollbackRevision(siteId, payload.revisionId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
