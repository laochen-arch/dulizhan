import { loginEmailUser } from "../../../../../db/email-auth";
import { sessionCookie } from "../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { email?: string; password?: string };
    const result = await loginEmailUser(payload.email || "", payload.password || "");
    const response = Response.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
    response.headers.append("Set-Cookie", sessionCookie(result.sessionToken));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_CREDENTIALS";
    return Response.json({ error: message === "INVALID_EMAIL" ? "请输入有效邮箱。" : "邮箱或密码不正确。", code: message }, { status: 401 });
  }
}
