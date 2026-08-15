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
  if (["REVISION_NOT_FOUND", "ASSET_NOT_FOUND", "OPERATION_EVENT_NOT_FOUND"].includes(message)) return Response.json({ error: "The requested CMS record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (message === "INVITATION_NOT_FOUND" || message === "MEMBER_NOT_FOUND") return Response.json({ error: "The requested access record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (["ORDER_NOT_FOUND", "PRODUCT_NOT_FOUND", "PAYMENT_EVENT_NOT_FOUND", "NOTIFICATION_NOT_FOUND", "AFTER_SALES_NOT_FOUND", "REVIEW_NOT_FOUND"].includes(message)) return Response.json({ error: "The requested commerce record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (["INVALID_INVITATION", "INVITATION_NOT_ACTIVE", "INVITATION_EMAIL_MISMATCH"].includes(message)) return Response.json({ error: "This invitation cannot be accepted by the current account.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (["LAST_OWNER", "CANNOT_REMOVE_SELF", "DOMAIN_IN_USE"].includes(message)) return Response.json({ error: "This access or domain change is not allowed.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (["INVALID_SITE", "INVALID_MEMBER", "INVALID_SCHEDULE", "INVALID_LAUNCH_CHECK", "INVALID_DELIVERY_STEP", "INVALID_DELIVERY_STATUS", "INVALID_OPERATION"].includes(message)) return Response.json({ error: "The submitted CMS fields are invalid.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (message === "INVALID_IMPORT") return Response.json({ error: "The import file must include a header row and at least one product row.", code: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (message.startsWith("INVALID_IMPORT:")) {
    try {
      return Response.json({ error: "The import contains invalid active products.", code: "INVALID_IMPORT", errors: JSON.parse(message.slice("INVALID_IMPORT:".length)) }, { status: 400, headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "The import contains invalid products.", code: "INVALID_IMPORT" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (["INVALID_INVENTORY", "INVENTORY_BELOW_RESERVED", "INVALID_ORDER_STATUS", "ORDER_NOT_PAID", "ORDER_NOT_REFUNDABLE", "INVALID_REFUND_AMOUNT", "INVALID_REFUND_RESTOCK", "REFUND_PAYMENT_NOT_FOUND", "PAYMENT_NOT_CONFIGURED", "REFUND_PROVIDER_ERROR", "INVALID_AFTER_SALES", "INVALID_COUPON", "INVALID_REVIEW", "INVALID_ANALYTICS_EVENT"].includes(message)) return Response.json({ error: message === "ORDER_NOT_PAID" ? "Paid orders must be confirmed before fulfillment can advance." : message === "PAYMENT_NOT_CONFIGURED" ? "PayPal is not configured in the production runtime." : message === "REFUND_PROVIDER_ERROR" ? "PayPal could not complete the refund. Review the refund record and retry from the provider if needed." : "The submitted commerce fields are invalid.", code: message }, { status: message === "REFUND_PROVIDER_ERROR" ? 502 : 400, headers: { "Cache-Control": "no-store" } });
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
