import { resolvePlatformApplicationAccess } from "../../application-access";
import { createPlatformDomainRequest, getPlatformApplication, updatePlatformDomainRequest } from "../../../../../db/v32";
import { sendPlatformApplicationNotification } from "../../../../../app/platform/application-notifications";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400, code = "PLATFORM_DOMAIN_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; token?: string; hostname?: string; siteId?: string | null };
    if (!payload.applicationId) return errorResponse("Application id is required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token);
    if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
    const requests = await createPlatformDomainRequest(payload.applicationId, { hostname: payload.hostname, siteId: payload.siteId || access.application.assignedSiteId }, access.actor);
    const application = await getPlatformApplication(payload.applicationId);
    const notification = application ? await sendPlatformApplicationNotification({ request, application, eventType: "domain_requested", dedupeKey: `${application.id}:domain_requested:${requests[0]?.id || payload.hostname}` }) : null;
    return Response.json({ requests, notification }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to request a domain.";
    if (message === "DOMAIN_REQUEST_EXISTS") return errorResponse("This domain already has an active request.", 409, message);
    return errorResponse(message === "INVALID_DOMAIN" ? "Enter a valid domain such as shop.example.com." : message, 400, message);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; requestId?: string; status?: string; note?: string | null };
    if (!payload.applicationId || !payload.requestId) return errorResponse("Application id and request id are required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId);
    if (!access?.canReview) return errorResponse("Only platform operators can update domain requests.", 403, "FORBIDDEN");
    const requests = await updatePlatformDomainRequest(payload.applicationId, payload.requestId, { status: payload.status, note: payload.note }, access.actor);
    const application = await getPlatformApplication(payload.applicationId);
    const notification = application ? await sendPlatformApplicationNotification({ request, application, eventType: "domain_status_changed", dedupeKey: `${application.id}:domain_status:${payload.requestId}:${payload.status || "unchanged"}:${Date.now()}` }) : null;
    return Response.json({ requests, notification }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the domain request.";
    return errorResponse(message, message === "DOMAIN_REQUEST_NOT_FOUND" ? 404 : 400, message);
  }
}
