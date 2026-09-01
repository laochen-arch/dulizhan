import { createRefund, getOrder } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; orderId?: string; amount?: number; reason?: string; idempotencyKey?: string; restockItems?: Array<{ productId: string; variantId: string; quantity: number }> };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.orderId) return Response.json({ error: "orderId is required.", code: "ORDER_NOT_FOUND" }, { status: 400 });
    const idempotencyKey = request.headers.get("x-idempotency-key") || payload.idempotencyKey || "";
    const detail = await createRefund(siteId, payload.orderId, payload.amount, payload.reason || "", payload.restockItems, access.user.userId, access.user.email, idempotencyKey);
    return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    const orderId = url.searchParams.get("orderId");
    if (!orderId) return Response.json({ refunds: [] }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ refunds: (await getOrder(siteId, orderId, access.user.userId, access.user.email)).refunds }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
