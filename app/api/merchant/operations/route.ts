import { getV24LaunchCenter } from "../../../../db/v24";
import { getAnalyticsSummary } from "../../../../db/v21";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.read");
    const [launch, analytics] = await Promise.all([getV24LaunchCenter(access.site.id, access.user!.userId, access.user!.email, true), getAnalyticsSummary(access.site.id, Number(new URL(request.url).searchParams.get("days") || 30))]);
    return Response.json({ ...launch, analytics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
