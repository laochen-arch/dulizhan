import { requireMerchantMember, manageErrorResponse } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, site, member } = await requireMerchantMember(request);
    return Response.json({ authenticated: true, user: { id: user.userId, email: user.email, displayName: user.displayName }, site: { id: site.id, slug: site.slug, name: site.name }, role: member.role }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageErrorResponse(error);
  }
}
