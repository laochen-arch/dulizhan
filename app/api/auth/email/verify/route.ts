import { verifyEmailUser } from "../../../../../db/email-auth";
import { authRateLimit } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const rateLimit = await authRateLimit(request, "verify", token, 10);
    if (rateLimit) return rateLimit;
    await verifyEmailUser(token);
    return Response.json({ ok: true, message: "邮箱已验证，可以继续使用账号。" });
  } catch { return Response.json({ error: "验证链接无效或已过期。", code: "AUTH_TOKEN_INVALID" }, { status: 400 }); }
}
