import { getOrder, listOrders, updateOrderAdminNote, updateOrderFulfillment } from "../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    const orderId = url.searchParams.get("orderId");
    if (orderId) return Response.json(await getOrder(siteId, orderId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
    return Response.json({ orders: await listOrders(siteId, access.user.userId, access.user.email, url.searchParams.get("status") || undefined) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; orderId?: string; fulfillmentStatus?: string; trackingNumber?: string; adminNote?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.orderId) return Response.json({ error: "orderId is required.", code: "INVALID_ORDER_STATUS" }, { status: 400 });
    if (payload.fulfillmentStatus) await updateOrderFulfillment(siteId, payload.orderId, payload.fulfillmentStatus, payload.trackingNumber || "", access.user.userId, access.user.email);
    if (payload.adminNote !== undefined) await updateOrderAdminNote(siteId, payload.orderId, payload.adminNote, access.user.userId, access.user.email);
    return Response.json({ order: (await getOrder(siteId, payload.orderId, access.user.userId, access.user.email)).order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
