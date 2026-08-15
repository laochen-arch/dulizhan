import { getProductionReadiness } from "../../../../db/v22";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json(await getProductionReadiness(siteId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
