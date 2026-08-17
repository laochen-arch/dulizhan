import { resetEmailPassword } from "../../../../../db/email-auth";
import { authRateLimit } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { token?: string; password?: string };
    const rateLimit = await authRateLimit(request, "reset", payload.token || "", 10);
    if (rateLimit) return rateLimit;
    await resetEmailPassword(payload.token || "", payload.password || "");
    return Response.json({ ok: true, message: "密码已更新，请重新登录。" });
  } catch (error) { const message = error instanceof Error ? error.message : "AUTH_TOKEN_INVALID"; return Response.json({ error: message === "PASSWORD_TOO_SHORT" ? "密码至少需要 8 位。" : "重置链接无效或已过期。", code: message }, { status: 400 }); }
}
