import { createPreviewShare } from "../../../../db/v24";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; hours?: number };
    const access = await requireMerchantCapability(request, "merchant.storefront.write", payload.siteId);
    const result = await createPreviewShare(access.site.id, payload.hours, access.user!.userId, access.user!.email, true);
    const origin = new URL(request.url).origin;
    return Response.json({ ...result, url: `${origin}/preview?siteId=${encodeURIComponent(access.site.id)}&token=${encodeURIComponent(result.token)}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
