import { retryOrderNotification } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; notificationId?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.notificationId) return Response.json({ error: "notificationId is required.", code: "NOTIFICATION_NOT_FOUND" }, { status: 400 });
    return Response.json(await retryOrderNotification(siteId, payload.notificationId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
