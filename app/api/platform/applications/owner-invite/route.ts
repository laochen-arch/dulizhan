import { getChatGPTUser } from "../../../../chatgpt-auth";
import { acceptPlatformOwnerInvite } from "../../../../../db/v32";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "请先登录申请邮箱对应的账号。", code: "AUTH_REQUIRED" }, { status: 401 });
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; token?: string };
    if (!payload.applicationId || !payload.token) return Response.json({ error: "邀请链接无效。", code: "OWNER_INVITE_INVALID" }, { status: 400 });
    const application = await acceptPlatformOwnerInvite(payload.applicationId, payload.token, { userId: user.userId, email: user.email, role: "applicant" });
    return Response.json({ application, siteId: application?.assignedSiteId || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to activate merchant owner access.";
    const labels: Record<string, string> = { OWNER_INVITE_INVALID: "邀请链接无效或已被使用。", OWNER_INVITE_EXPIRED: "邀请链接已过期，请让平台方重新发送。", OWNER_INVITE_EMAIL_MISMATCH: "请使用申请时填写的邮箱登录。", SITE_REQUIRED_FOR_OWNER_INVITE: "站点还未准备好，请稍后再试。" };
    const status = message === "OWNER_INVITE_EMAIL_MISMATCH" ? 403 : message === "APPLICATION_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: labels[message] || message, code: message }, { status });
  }
}
