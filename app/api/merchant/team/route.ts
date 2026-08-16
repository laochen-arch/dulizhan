import { listMerchantMembers, removeMerchantMember, upsertMerchantMember, type MerchantRole } from "../../../../db/v25";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

function validRole(value: unknown): MerchantRole {
  if (value === "merchant_owner" || value === "merchant_manager" || value === "merchant_staff") return value;
  throw new Error("INVALID_MEMBER");
}

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.team.manage");
    return Response.json({ members: await listMerchantMembers(access.site.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return merchantErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; userId?: string; email?: string; role?: string };
    const access = await requireMerchantCapability(request, "merchant.team.manage", payload.siteId);
    const email = payload.email?.trim().toLowerCase() || "";
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_MEMBER");
    const member = await upsertMerchantMember(access.site.id, { userId: payload.userId?.trim() || email, email, role: validRole(payload.role) }, "invited");
    return Response.json({ member }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return merchantErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; userId?: string; email?: string; role?: string };
    const access = await requireMerchantCapability(request, "merchant.team.manage", payload.siteId);
    if (!payload.userId || !payload.email) throw new Error("INVALID_MEMBER");
    const member = await upsertMerchantMember(access.site.id, { userId: payload.userId, email: payload.email, role: validRole(payload.role) }, "invited");
    return Response.json({ member }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return merchantErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; userId?: string };
    const access = await requireMerchantCapability(request, "merchant.team.manage", payload.siteId);
    if (!payload.userId) throw new Error("MEMBER_NOT_FOUND");
    if (payload.userId === access.user!.userId) throw new Error("CANNOT_REMOVE_SELF");
    return Response.json({ members: await removeMerchantMember(access.site.id, payload.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return merchantErrorResponse(error); }
}
