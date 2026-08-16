import { getMerchantWorkspaceOverview } from "../../../../db/v25";
import { requireMerchantMember, manageErrorResponse } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { site, user } = await requireMerchantMember(request);
    return Response.json(await getMerchantWorkspaceOverview(site.id, user.userId, user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return manageErrorResponse(error);
  }
}
