import { createPasswordResetToken } from "../../../../../db/email-auth";
import { sendAuthEmail } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { email?: string };
  try {
    const result = payload.email ? await createPasswordResetToken(payload.email) : null;
    if (result) await sendAuthEmail({ request, to: result.user.email, kind: "reset", token: result.token });
  } catch { /* Keep account enumeration out of the response. */ }
  return Response.json({ ok: true, message: "如果邮箱已注册，密码重置链接会发送到邮箱。" });
}
