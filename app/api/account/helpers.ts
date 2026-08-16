import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";
import { resolveSiteByHost, type CmsSite } from "../../../db/cms";
import { ensureStoreCustomer } from "../../../db/v25";

export async function getAccountContext(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new AccountApiError("Sign in to use your store account.", 401, "AUTH_REQUIRED");
  const site = await resolveSiteByHost(request.headers.get("host"));
  const customer = await ensureStoreCustomer(site.id, user);
  return { user, site, customer };
}

export async function getPublicAccountSite(request: Request): Promise<CmsSite> {
  return resolveSiteByHost(request.headers.get("host"));
}

export class AccountApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "ACCOUNT_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function accountErrorResponse(error: unknown) {
  if (error instanceof AccountApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const message = error instanceof Error ? error.message : "The account service is unavailable.";
  const status = message === "AUTH_REQUIRED" ? 401 : ["ORDER_NOT_FOUND", "ADDRESS_NOT_FOUND", "PRODUCT_NOT_FOUND"].includes(message) ? 404 : ["INVALID_PROFILE", "INVALID_ADDRESS"].includes(message) ? 400 : 500;
  const code = message === "AUTH_REQUIRED" ? "AUTH_REQUIRED" : message;
  return Response.json({ error: status === 500 ? "The account service is unavailable." : message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export function userPayload(user: ChatGPTUser) {
  return { id: user.userId, email: user.email, displayName: user.displayName };
}
