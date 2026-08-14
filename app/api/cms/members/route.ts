import { addMember, createInvitation, listInvitations, listMembers, removeMember, revokeInvitation, updateMember, type CmsRole } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    const members = await listMembers(siteId, access.user.userId, access.user.email);
    const invitations = access.member.role === "owner" ? await listInvitations(siteId, access.user.userId, access.user.email) : [];
    return Response.json({ members, invitations }, { headers: { "Cache-Control": "no-store" } });
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
    if (payload.userId?.trim()) return Response.json({ member: await addMember(siteId, { userId: payload.userId.trim(), email, role }, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
    return Response.json({ invitation: await createInvitation(siteId, email, role, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; userId?: string; role?: CmsRole };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    if (!payload.userId || !["owner", "editor", "viewer"].includes(payload.role || "")) return Response.json({ error: "userId and role are required.", code: "INVALID_MEMBER" }, { status: 400 });
    return Response.json({ member: await updateMember(siteId, payload.userId, payload.role as CmsRole, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "owner");
    const userId = url.searchParams.get("userId");
    const invitationId = url.searchParams.get("invitationId");
    if (invitationId) return Response.json(await revokeInvitation(siteId, invitationId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
    if (!userId) return Response.json({ error: "userId or invitationId is required.", code: "INVALID_MEMBER" }, { status: 400 });
    return Response.json(await removeMember(siteId, userId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
