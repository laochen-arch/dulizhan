import { getClientOperations } from "../../../../db/v24";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json(await getClientOperations(siteId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
