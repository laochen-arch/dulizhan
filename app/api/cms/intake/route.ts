import { getClientIntake, updateClientIntake } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const siteId = getSiteId(request); const access = await requireMember(siteId, "viewer"); return Response.json({ intake: await getClientIntake(siteId), role: access.member.role }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; action?: "save" | "submit" | "approve"; data?: Record<string, string> };
    const siteId = getSiteId(request, payload.siteId); const access = await requireMember(siteId, payload.action === "approve" ? "owner" : "editor");
    return Response.json({ intake: await updateClientIntake(siteId, payload.data || {}, payload.action || "save", access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
