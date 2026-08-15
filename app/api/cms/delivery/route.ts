import { getDeliveryRun, updateDeliveryRun } from "../../../../db/v22";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ delivery: await getDeliveryRun(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      siteId?: string;
      currentStep?: string;
      status?: string;
      packageName?: string | null;
      packageSummary?: Record<string, unknown> | null;
      importRevisionId?: string | null;
      lastError?: string | null;
    };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    return Response.json({ delivery: await updateDeliveryRun(siteId, payload, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
