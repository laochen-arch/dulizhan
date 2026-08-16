import { getOrder, updateOrderAdminNote, updateOrderFulfillment } from "../../../../db/commerce";
import { getClientOrderDetail, type ClientOrderDetail } from "../../../../db/v24";
import { listClientOrders } from "../../../../db/v23";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "orders.read");
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (orderId) return Response.json(await getClientOrderDetail(access.site.id, orderId, access.user!.userId, access.user!.email, true) as ClientOrderDetail, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ orders: await listClientOrders(access.site.id, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; orderId?: string; fulfillmentStatus?: string; trackingNumber?: string; adminNote?: string };
    const access = await requireMerchantCapability(request, "orders.write", payload.siteId);
    if (!payload.orderId) throw new Error("ORDER_NOT_FOUND");
    if (payload.fulfillmentStatus) await updateOrderFulfillment(access.site.id, payload.orderId, payload.fulfillmentStatus, payload.trackingNumber || "", access.user!.userId, access.user!.email);
    if (payload.adminNote !== undefined) await updateOrderAdminNote(access.site.id, payload.orderId, payload.adminNote, access.user!.userId, access.user!.email);
    return Response.json({ order: (await getOrder(access.site.id, payload.orderId, access.user!.userId, access.user!.email)).order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
