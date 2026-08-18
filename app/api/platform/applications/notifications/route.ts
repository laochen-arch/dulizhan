import { listPlatformApplicationNotifications } from "../../../../../db/v32";
import { retryPlatformApplicationNotification } from "../../../../../app/platform/application-notifications";
import { resolvePlatformApplicationAccess } from "../../application-access";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400, code = "PLATFORM_NOTIFICATION_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId") || "";
  if (!applicationId) return errorResponse("Application id is required.");
  const access = await resolvePlatformApplicationAccess(applicationId, url.searchParams.get("token"));
  if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
  return Response.json({ notifications: await listPlatformApplicationNotifications(applicationId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; notificationId?: string };
    if (!payload.applicationId || !payload.notificationId) return errorResponse("Application id and notification id are required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId);
    if (!access?.canReview) return errorResponse("Only platform operators can retry application notifications.", 403, "FORBIDDEN");
    const notification = await retryPlatformApplicationNotification({ request, applicationId: payload.applicationId, notificationId: payload.notificationId });
    return Response.json({ notification }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry the application notification.";
    return errorResponse(message, message === "NOTIFICATION_NOT_FOUND" || message === "APPLICATION_NOT_FOUND" ? 404 : 400, message);
  }
}
