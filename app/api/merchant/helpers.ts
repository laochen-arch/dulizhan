import { getChatGPTUser } from "../../chatgpt-auth";
import { getMerchantMembership, merchantRoleCapabilities, type MerchantMember, type MerchantRole } from "../../../db/v25";
import { getSiteById, resolveSiteByHost, type CmsSite } from "../../../db/cms";

export type MerchantAccess = { user: Awaited<ReturnType<typeof getChatGPTUser>>; site: CmsSite; member: MerchantMember };

export async function resolveMerchantSite(request: Request, requestedSiteId?: unknown) {
  const querySiteId = new URL(request.url).searchParams.get("siteId");
  const candidate = typeof requestedSiteId === "string" ? requestedSiteId : querySiteId;
  if (candidate && /^[a-zA-Z0-9_-]{2,80}$/.test(candidate)) return getSiteById(candidate);
  return resolveSiteByHost(request.headers.get("host"));
}

export async function requireMerchantCapability(request: Request, capability: string, requestedSiteId?: unknown): Promise<MerchantAccess> {
  const user = await getChatGPTUser();
  if (!user) throw new MerchantApiError("Sign in with ChatGPT to open the merchant workspace.", 401, "AUTH_REQUIRED");
  const site = await resolveMerchantSite(request, requestedSiteId);
  const member = await getMerchantMembership(site.id, user.userId, user.email);
  if (!member || !merchantRoleCapabilities[member.role].includes(capability)) throw new MerchantApiError("You do not have permission for this merchant workspace action.", 403, "FORBIDDEN");
  return { user, site, member };
}

export function merchantCmsRole(role: MerchantRole) {
  return role === "merchant_owner" ? "owner" : role === "merchant_manager" ? "editor" : "viewer";
}

export class MerchantApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "MERCHANT_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function merchantErrorResponse(error: unknown) {
  if (error instanceof MerchantApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const message = error instanceof Error ? error.message : "The merchant workspace is unavailable.";
  const refundErrors: Record<string,string> = {ORDER_NOT_REFUNDABLE:"当前订单状态不允许退款。",INVALID_REFUND_AMOUNT:"金额超过当前可退余额，请刷新退款记录。",REFUND_PAYMENT_NOT_FOUND:"未找到可退款的支付凭证。",REFUND_IDEMPOTENCY_REQUIRED:"退款请求缺少唯一请求号，请刷新后重试。",REFUND_IDEMPOTENCY_CONFLICT:"此退款请求号已用于其他订单，请刷新后重试。",REFUND_PROVIDER_ERROR:"支付方未确认退款，请先查看退款记录，不要重复提交。"};
  if(refundErrors[message])return Response.json({error:refundErrors[message],code:message},{status:message==="REFUND_PROVIDER_ERROR"?502:409,headers:{"Cache-Control":"no-store"}});
  const notFound = ["SITE_NOT_FOUND", "PRODUCT_NOT_FOUND", "ORDER_NOT_FOUND", "AFTER_SALES_NOT_FOUND", "APPLICATION_NOT_FOUND"];
  const invalid = ["INVALID_PRODUCT", "INVALID_IMPORT", "INVALID_INVENTORY", "INVENTORY_BELOW_RESERVED", "INVALID_ORDER_STATUS", "ORDER_NOT_PAID", "INVALID_AFTER_SALES", "INVALID_COUPON", "INVALID_BUNDLE", "INVALID_BRAND", "INVALID_INTEGRATION", "INVALID_MEMBER", "VIEWER_READ_ONLY", "LAST_OWNER", "CANNOT_REMOVE_SELF", "PRODUCT_IN_USE"];
  if (notFound.includes(message)) return Response.json({ error: "The requested record was not found.", code: message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (invalid.includes(message) || message.startsWith("INVALID_PRODUCT:") || message.startsWith("INVALID_IMPORT:")) return Response.json({ error: "Please review the submitted fields.", code: message.split(":")[0] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (message === "FORBIDDEN") return Response.json({ error: "You do not have access to this merchant workspace.", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json({ error: message, code: "MERCHANT_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
