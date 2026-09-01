import { resolvePlatformApplicationAccess } from "../../application-access";
import { createPlatformSupportTicket, updatePlatformSupportTicket } from "../../../../../db/v32";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400, code = "PLATFORM_SUPPORT_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; token?: string; subject?: string; message?: string };
    if (!payload.applicationId) return errorResponse("Application id is required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token);
    if (!access) return errorResponse("You do not have access to this application.", 403, "FORBIDDEN");
    return Response.json({ tickets: await createPlatformSupportTicket(payload.applicationId, { subject: payload.subject, message: payload.message }, access.actor) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the support request.";
    return errorResponse(message === "INVALID_TICKET" ? "Enter a subject and a message before sending." : message, 400, message);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; ticketId?: string; status?: string; assignedTo?: string | null; adminNote?: string | null };
    if (!payload.applicationId || !payload.ticketId) return errorResponse("Application id and ticket id are required.");
    const access = await resolvePlatformApplicationAccess(payload.applicationId);
    if (!access?.canSupport) return errorResponse("Only platform support staff can update support requests.", 403, "FORBIDDEN");
    return Response.json({ tickets: await updatePlatformSupportTicket(payload.applicationId, payload.ticketId, { status: payload.status, assignedTo: payload.assignedTo, adminNote: payload.adminNote }, access.actor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the support request.";
    return errorResponse(message, message === "TICKET_NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : 400, message);
  }
}
