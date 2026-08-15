import { createReleaseRequest, listReleaseRequests, reviewReleaseRequest, rollbackPublishedRevision } from "../../../../db/v24";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ releases: await listReleaseRequests(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; label?: string; note?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    return Response.json({ release: await createReleaseRequest(siteId, payload, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; requestId?: string; action?: "approve" | "reject" | "publish" | "cancel" | "rollback"; note?: string; revisionId?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, payload.action === "cancel" ? "editor" : "owner");
    if (payload.action === "rollback") {
      if (!payload.revisionId) throw new Error("REVISION_NOT_FOUND");
      return Response.json({ result: await rollbackPublishedRevision(siteId, payload.revisionId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!payload.requestId || !payload.action) throw new Error("INVALID_RELEASE_ACTION");
    return Response.json({ release: await reviewReleaseRequest(siteId, payload.requestId, payload.action, access.user.userId, access.user.email, payload.note) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
