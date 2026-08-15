import { getSiteLaunchChecks, updateLaunchCheck } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    return Response.json(await getSiteLaunchChecks(siteId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; key?: string; completed?: boolean };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.key || typeof payload.completed !== "boolean") return Response.json({ error: "A launch check key and completed state are required.", code: "INVALID_LAUNCH_CHECK" }, { status: 400 });
    return Response.json(await updateLaunchCheck(siteId, payload.key, payload.completed, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
