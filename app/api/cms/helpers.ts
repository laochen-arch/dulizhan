import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";
import { getMember, type CmsRole } from "../../../db/cms";

export const DEFAULT_SITE_ID = "default";

export function getSiteId(request: Request, value?: unknown) {
  const queryValue = new URL(request.url).searchParams.get("siteId");
  const candidate = typeof value === "string" ? value : queryValue;
  return candidate && /^[a-zA-Z0-9_-]{2,80}$/.test(candidate) ? candidate : DEFAULT_SITE_ID;
}

export async function currentUser() {
  return getChatGPTUser();
}

export async function requireMember(siteId: string, minimum: CmsRole = "viewer") {
  const user = await getChatGPTUser();
  if (!user) throw new CmsApiError("Sign in with ChatGPT to manage this client site.", 401, "AUTH_REQUIRED");
  const member = await getMember(siteId, user.userId, user.email);
  const rank: Record<CmsRole, number> = { viewer: 1, editor: 2, owner: 3 };
  if (rank[member.role] < rank[minimum]) throw new CmsApiError("You do not have permission for this action.", 403, "FORBIDDEN");
  return { user, member };
}

export class CmsApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "CMS_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof CmsApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const message = error instanceof Error ? error.message : "CMS is unavailable.";
  if (message === "AUTH_REQUIRED") return Response.json({ error: "Sign in with ChatGPT to preview draft content.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (message === "FORBIDDEN") return Response.json({ error: "You do not have access to this client site.", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (message === "VIEWER_READ_ONLY") return Response.json({ error: "Viewer accounts cannot edit or publish content.", code: "VIEWER_READ_ONLY" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (message === "REVISION_NOT_FOUND" || message === "ASSET_NOT_FOUND") return Response.json({ error: "The requested CMS record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (message === "INVITATION_NOT_FOUND" || message === "MEMBER_NOT_FOUND") return Response.json({ error: "The requested access record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (["INVALID_INVITATION", "INVITATION_NOT_ACTIVE", "INVITATION_EMAIL_MISMATCH"].includes(message)) return Response.json({ error: "This invitation cannot be accepted by the current account.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (["LAST_OWNER", "CANNOT_REMOVE_SELF", "DOMAIN_IN_USE"].includes(message)) return Response.json({ error: "This access or domain change is not allowed.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (["INVALID_SITE", "INVALID_MEMBER", "INVALID_SCHEDULE"].includes(message)) return Response.json({ error: "The submitted CMS fields are invalid.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (message === "SITE_NOT_FOUND") return Response.json({ error: "The requested client site was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (message.startsWith("PUBLISH_CHECKS:")) {
    try {
      const checks = JSON.parse(message.slice("PUBLISH_CHECKS:".length)) as string[];
      return Response.json({ error: "Complete the launch checks before publishing.", code: "PUBLISH_CHECKS", checks }, { status: 400, headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "Complete the launch checks before publishing.", code: "PUBLISH_CHECKS" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  return Response.json({ error: message, code: "CMS_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export function userPayload(user: ChatGPTUser) {
  return { userId: user.userId, email: user.email };
}
