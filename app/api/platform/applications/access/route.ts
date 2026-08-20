import { createPlatformOwnerInvite, getPlatformApplication, rotatePlatformApplicationAccessToken } from "../../../../../db/v32";
import { resolvePlatformApplicationAccess } from "../../application-access";
import { sendPlatformApplicationNotification, sendPlatformOwnerInviteNotification } from "../../../../../app/platform/application-notifications";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400, code = "PLATFORM_ACCESS_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { action?: string; applicationId?: string; token?: string };
    if (!payload.applicationId) return errorResponse("Application id is required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token || null);
    if (payload.action === "resend_access_link") {
      if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
      const rotated = await rotatePlatformApplicationAccessToken(payload.applicationId, access.actor);
      const application = await getPlatformApplication(payload.applicationId);
      const notification = application ? await sendPlatformApplicationNotification({ request, application, eventType: "access_link_issued", dedupeKey: `${application.id}:access_link:${Date.now()}`, accessToken: rotated.accessToken }) : null;
      return Response.json({ ...rotated, notification }, { headers: { "Cache-Control": "no-store" } });
    }
    if (payload.action === "invite_owner") {
      if (!access?.canReview) return errorResponse("Only platform operators can invite the merchant owner.", 403, "FORBIDDEN");
      const invite = await createPlatformOwnerInvite(payload.applicationId, access.actor);
      if (!invite.application) throw new Error("APPLICATION_NOT_FOUND");
      const notification = await sendPlatformOwnerInviteNotification({ request, application: invite.application, inviteToken: invite.token, dedupeKey: `${invite.application.id}:owner_invite:${invite.expiresAt}` });
      return Response.json({ application: invite.application, notification }, { headers: { "Cache-Control": "no-store" } });
    }
    return errorResponse("Unknown access action.", 400, "UNKNOWN_ACTION");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update application access.";
    const status = ["APPLICATION_NOT_FOUND"].includes(message) ? 404 : ["FORBIDDEN"].includes(message) ? 403 : 400;
    return errorResponse(message, status, message);
  }
}
