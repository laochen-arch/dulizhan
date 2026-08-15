import { listPaymentEvents, retryPaymentEvent } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    return Response.json({ events: await listPaymentEvents(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; eventId?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.eventId) return Response.json({ error: "eventId is required.", code: "PAYMENT_EVENT_NOT_FOUND" }, { status: 400 });
    return Response.json(await retryPaymentEvent(siteId, payload.eventId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
