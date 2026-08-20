import { findEmailUser, issueEmailAuthToken } from "../../../../../db/email-auth";
import { authRateLimit, sendAuthEmail } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { email?: string };
    const rateLimit = await authRateLimit(request, "resend-verification", payload.email || "", 3);
    if (rateLimit) return rateLimit;
    const email = String(payload.email || "").trim().toLowerCase();
    const user = await findEmailUser(email);
    if (!user || user.emailVerifiedAt) return Response.json({ ok: true, message: "如果账号需要验证，新的验证邮件已发送。" }, { headers: { "Cache-Control": "no-store" } });
    const token = await issueEmailAuthToken(user.userId.replace(/^email:/, ""), "verify_email");
    const sent = await sendAuthEmail({ request, to: user.email, kind: "verify", token });
    return Response.json({ ok: true, sent, message: sent ? "验证邮件已重新发送。" : "验证邮件服务暂未配置，请联系平台管理员。" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: true, message: "如果账号需要验证，新的验证邮件已发送。" }, { headers: { "Cache-Control": "no-store" } });
  }
}
