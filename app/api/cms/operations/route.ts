import { listOperationEvents, resolveOperationEvent } from "../../../../db/v22";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ events: await listOperationEvents(siteId, access.user.userId, access.user.email, url.searchParams.get("status") || undefined) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; eventId?: string; action?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.eventId || payload.action !== "resolve") return Response.json({ error: "Choose an operation event and a supported action.", code: "INVALID_OPERATION" }, { status: 400 });
    return Response.json({ events: await resolveOperationEvent(siteId, payload.eventId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
