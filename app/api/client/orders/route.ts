import { getClientOrderDetail } from "../../../../db/v24";
import { listClientOrders } from "../../../../db/v23";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    const orderId = url.searchParams.get("orderId");
    if (orderId) return Response.json(await getClientOrderDetail(siteId, orderId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
    return Response.json({ orders: await listClientOrders(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
