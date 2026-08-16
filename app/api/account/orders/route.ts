import { getAccountContext, accountErrorResponse } from "../helpers";
import { getCustomerOrder, listCustomerOrders } from "../../../../db/v25";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { site, user } = await getAccountContext(request);
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (orderId) return Response.json({ order: await getCustomerOrder(site.id, orderId, user.email) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ orders: await listCustomerOrders(site.id, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
