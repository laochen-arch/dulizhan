import { registerEmailUser } from "../../../../../db/email-auth";
import { authRateLimit, sendAuthEmail, sessionCookie } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { email?: string; password?: string; displayName?: string };
    const rateLimit = await authRateLimit(request, "register", payload.email || "", 5);
    if (rateLimit) return rateLimit;
    const result = await registerEmailUser({ email: payload.email || "", password: payload.password || "", displayName: payload.displayName || "" });
    const verificationSent = await sendAuthEmail({ request, to: result.user.email, kind: "verify", token: result.verificationToken });
    const response = Response.json({ user: result.user, verificationSent }, { status: 201, headers: { "Cache-Control": "no-store" } });
    if (result.sessionToken) response.headers.append("Set-Cookie", sessionCookie(result.sessionToken));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "REGISTER_FAILED";
    const labels: Record<string, string> = { EMAIL_EXISTS: "该邮箱已经注册，请直接登录。", PASSWORD_TOO_SHORT: "密码至少需要 8 位。", DISPLAY_NAME_REQUIRED: "请输入姓名或品牌负责人名称。", INVALID_EMAIL: "请输入有效邮箱。" };
    return Response.json({ error: labels[message] || "注册失败，请稍后重试。", code: message }, { status: 400 });
  }
}
