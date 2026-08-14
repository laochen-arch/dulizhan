import { cancelSchedule, createSchedule, listSchedules } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ schedules: await listSchedules(siteId, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; label?: string; scheduledAt?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    if (!payload.scheduledAt) return Response.json({ error: "scheduledAt is required.", code: "INVALID_SCHEDULE" }, { status: 400 });
    return Response.json({ schedule: await createSchedule(siteId, payload.label || "Scheduled storefront release", payload.scheduledAt, access.user.userId, access.user.email) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    const scheduleId = url.searchParams.get("scheduleId");
    if (!scheduleId) return Response.json({ error: "scheduleId is required.", code: "INVALID_SCHEDULE" }, { status: 400 });
    return Response.json(await cancelSchedule(siteId, scheduleId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
