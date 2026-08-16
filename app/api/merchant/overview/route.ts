import { getClientPortalOverview } from "../../../../db/v23";
import { getMerchantWorkspaceOverview } from "../../../../db/v25";
import { merchantCmsRole, merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.read");
    const portal = await getClientPortalOverview(access.site.id, access.user!.userId, access.user!.email, true);
    const workspace = await getMerchantWorkspaceOverview(access.site.id, access.user!.userId, access.user!.email);
    return Response.json({ ...portal, role: merchantCmsRole(access.member.role), merchantRole: access.member.role, capabilities: workspace.capabilities }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
