import { resolvePlatformApplicationAccess } from "../../../application-access";
import { createPlatformPayPalSubscription, enforcePlatformRateLimit } from "../../../../../../db/v61";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { applicationId?: string; token?: string };
    if (!payload.applicationId) return Response.json({ error: "Application id is required.", code: "APPLICATION_REQUIRED" }, { status: 400 });
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token || null);
    if (!access) return Response.json({ error: "This application is not accessible.", code: "FORBIDDEN" }, { status: 403 });
    await enforcePlatformRateLimit("platform-paypal-subscription", `${access.actor.userId}:${request.headers.get("cf-connecting-ip") || "unknown"}`, 5, 60);
    const origin = new URL(request.url).origin;
    const subscription = await createPlatformPayPalSubscription(payload.applicationId, origin, access.actor);
    return Response.json({ subscription }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PLATFORM_PAYPAL_CREATE_FAILED";
    const labels: Record<string, string> = {
      AGREEMENT_REQUIRED: "请先选择套餐并签署平台服务协议。",
      PLATFORM_PAYPAL_NOT_CONFIGURED: "平台 PayPal 订阅参数尚未配置。",
      PLATFORM_PAYPAL_PLAN_NOT_CONFIGURED: "当前套餐尚未绑定 PayPal 订阅计划。",
      FORBIDDEN: "当前账号无权操作这条申请。",
      RATE_LIMITED: "操作过于频繁，请一分钟后重试。",
    };
    return Response.json({ error: labels[code] || "暂时无法创建 PayPal 订阅，请稍后重试。", code }, { status: code === "FORBIDDEN" ? 403 : code === "RATE_LIMITED" ? 429 : 409, headers: { "Cache-Control": "no-store" } });
  }
}
