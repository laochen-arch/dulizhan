import { getChatGPTUser } from "../../chatgpt-auth";
import { getMerchantMembership, type MerchantRole } from "../../../db/v25";
import { resolveSiteByHost, getSiteById, type CmsSite } from "../../../db/cms";

const roleRank: Record<MerchantRole, number> = { merchant_support: 1, merchant_staff: 1, merchant_manager: 2, merchant_owner: 3 };

export async function resolveManageSite(request: Request): Promise<CmsSite> {
  const requested = new URL(request.url).searchParams.get("siteId");
  if (requested && /^[a-zA-Z0-9_-]{2,80}$/.test(requested)) return getSiteById(requested);
  return resolveSiteByHost(request.headers.get("host"));
}

export async function requireMerchantMember(request: Request, minimum: MerchantRole = "merchant_staff") {
  const user = await getChatGPTUser();
  if (!user) throw new ManageApiError("Sign in with ChatGPT to open the merchant workspace.", 401, "AUTH_REQUIRED");
  const site = await resolveManageSite(request);
  const member = await getMerchantMembership(site.id, user.userId, user.email);
  if (!member || roleRank[member.role] < roleRank[minimum]) throw new ManageApiError("You do not have merchant workspace access for this storefront.", 403, "FORBIDDEN");
  return { user, site, member };
}

export class ManageApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "MANAGE_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function manageErrorResponse(error: unknown) {
  if (error instanceof ManageApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const message = error instanceof Error ? error.message : "The merchant workspace is unavailable.";
  if (message === "MERCHANT_FORBIDDEN") return Response.json({ error: "You do not have merchant workspace access for this storefront.", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json({ error: "The merchant workspace is unavailable.", code: "MANAGE_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
