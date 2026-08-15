import { getClientOperations, submitClientAfterSales } from "../../../../db/v24";
import { getAfterSalesRequest } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    const id = url.searchParams.get("id");
    if (id) return Response.json({ request: await getAfterSalesRequest(siteId, id) }, { headers: { "Cache-Control": "no-store" } });
    const operations = await getClientOperations(siteId, access.user.userId, access.user.email);
    return Response.json({ requests: operations.afterSales }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; orderNumber?: string; email?: string; requestType?: string; reason?: string; customerNote?: string; requestedAmount?: number; items?: Array<{ productId: string; variantId: string; quantity: number }> };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ request: await submitClientAfterSales(siteId, { orderNumber: payload.orderNumber || "", email: payload.email || "", requestType: payload.requestType || "return", reason: payload.reason || "", customerNote: payload.customerNote, requestedAmount: payload.requestedAmount, items: payload.items }, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
