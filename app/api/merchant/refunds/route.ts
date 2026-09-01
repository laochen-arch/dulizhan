import { createRefund } from "../../../../db/commerce";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; orderId?: string; amount?: number; reason?: string; idempotencyKey?: string };
    const access = await requireMerchantCapability(request, "orders.refund", payload.siteId);
    if (!payload.orderId) return Response.json({error:"请选择要退款的订单。",code:"ORDER_NOT_FOUND"},{status:400});
    if(typeof payload.amount!=="number"||!Number.isFinite(payload.amount)||payload.amount<=0||!payload.reason?.trim()) return Response.json({error:"请填写有效的退款金额与原因。",code:"INVALID_REFUND_AMOUNT"},{status:400});
    // The existing provider workflow owns payment validation, refund records and webhook completion.
    // No automatic retries or inventory restocking are performed by this endpoint.
    const idempotencyKey=request.headers.get("x-idempotency-key")||payload.idempotencyKey||"";
    const detail=await createRefund(access.site.id,payload.orderId,payload.amount,payload.reason,[],access.user!.userId,access.user!.email,idempotencyKey);
    return Response.json({refunds:detail.refunds,paymentStatus:detail.order.paymentStatus,refundTotal:detail.order.refundTotal},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return merchantErrorResponse(error);}
}
