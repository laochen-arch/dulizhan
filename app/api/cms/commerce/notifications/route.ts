import { retryDueOrderNotifications, retryOrderNotification } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; notificationId?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.notificationId) return Response.json(await retryDueOrderNotifications(siteId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
    return Response.json(await retryOrderNotification(siteId, payload.notificationId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
