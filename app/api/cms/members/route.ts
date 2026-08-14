import { addMember, listMembers, type CmsRole } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ members: await listMembers(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; userId?: string; email?: string; role?: CmsRole };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    const email = payload.email?.trim().toLowerCase() ?? "";
    const role = payload.role === "owner" || payload.role === "editor" ? payload.role : "viewer";
    if (!email || !email.includes("@")) return Response.json({ error: "A valid member email is required.", code: "INVALID_MEMBER" }, { status: 400 });
    const userId = payload.userId?.trim() || `invite:${email}`;
    return Response.json({ member: await addMember(siteId, { userId, email, role }, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
