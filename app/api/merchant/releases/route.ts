import { createReleaseRequest, listReleaseRequests } from "../../../../db/v24";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.read");
    return Response.json({ releases: await listReleaseRequests(access.site.id, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; label?: string; note?: string };
    const access = await requireMerchantCapability(request, "merchant.storefront.write", payload.siteId);
    return Response.json({ release: await createReleaseRequest(access.site.id, { label: payload.label, note: payload.note }, access.user!.userId, access.user!.email, true) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
