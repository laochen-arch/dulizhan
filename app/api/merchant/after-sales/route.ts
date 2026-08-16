import { listAfterSalesRequests, updateAfterSalesRequest } from "../../../../db/v21";
import { submitClientAfterSales } from "../../../../db/v24";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "after-sales.read");
    return Response.json({ requests: await listAfterSalesRequests(access.site.id, new URL(request.url).searchParams.get("status") || undefined) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; orderNumber?: string; email?: string; requestType?: string; reason?: string; customerNote?: string; requestedAmount?: number; items?: Array<{ productId: string; variantId: string; quantity: number }> };
    const access = await requireMerchantCapability(request, "after-sales.write", payload.siteId);
    if (!payload.orderNumber || !payload.email || !payload.reason) throw new Error("INVALID_AFTER_SALES");
    return Response.json({ request: await submitClientAfterSales(access.site.id, { orderNumber: payload.orderNumber, email: payload.email, requestType: payload.requestType || "return", reason: payload.reason, customerNote: payload.customerNote, requestedAmount: payload.requestedAmount, items: payload.items }, access.user!.userId, access.user!.email, true) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; id?: string; status?: string; adminNote?: string };
    const access = await requireMerchantCapability(request, "after-sales.write", payload.siteId);
    if (!payload.id) throw new Error("AFTER_SALES_NOT_FOUND");
    return Response.json({ request: await updateAfterSalesRequest(access.site.id, payload.id, payload.status || "processing", payload.adminNote || "", access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
