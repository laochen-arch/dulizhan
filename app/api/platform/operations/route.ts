import { getPlatformOperationsSnapshot } from "../../../../db/v60";
import { createPlatformRenewalInvoice, managePlatformSubscription, recordPlatformPayment } from "../../../../db/v34";
import { getPlatformStaffAccess } from "../staff-access";
import { enforcePlatformRateLimit, getV61OperationsSnapshot, recordPlatformSecurityEvent, runPlatformDeliveryJob, runV61PlatformAutomation } from "../../../../db/v61";

export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  const labels: Record<string, string> = {
    FORBIDDEN: "当前账号没有平台商业化管理权限。",
    PLAN_REQUIRED: "请先为商户选择套餐。",
    TRIAL_NOT_AVAILABLE: "当前套餐状态不能再次启动试用。",
    SUBSCRIPTION_NOT_ACTIVE: "当前套餐不能生成续费账单。",
    INVOICE_NOT_FOUND: "账单不存在或已被移除。",
  };
  return Response.json({ error: labels[message] || message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const staff = await getPlatformStaffAccess();
    if (!staff || !staff.capabilities.includes("applications.read")) return error("FORBIDDEN", 403);
    const [operations, automation] = await Promise.all([getPlatformOperationsSnapshot(), getV61OperationsSnapshot()]);
    return Response.json({ ...operations, automation }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "平台经营数据读取失败。", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getPlatformStaffAccess();
    if (!staff || !staff.capabilities.includes("billing.manage")) return error("FORBIDDEN", 403);
    const payload = await request.json().catch(() => ({})) as { action?: string; applicationId?: string; invoiceId?: string; trialDays?: number; providerReference?: string; failureReason?: string };
    const actor = { userId: staff.user.userId, email: staff.user.email, role: "platform" as const };
    await enforcePlatformRateLimit("platform-operations", `${actor.userId}:${request.headers.get("cf-connecting-ip") || "unknown"}`, 30, 60);
    if (payload.action === "run_automation") {
      await recordPlatformSecurityEvent({ actor, action: "platform.automation.run", targetType: "platform", riskLevel: "high", requestId: request.headers.get("cf-ray"), ip: request.headers.get("cf-connecting-ip") });
      return Response.json({ automation: await runV61PlatformAutomation() }, { headers: { "Cache-Control": "no-store" } });
    }
    if (payload.action === "retry_delivery") {
      if (!payload.applicationId) return error("请选择要重试交付的商户。");
      await recordPlatformSecurityEvent({ actor, action: "platform.delivery.retry", targetType: "platform_application", targetId: payload.applicationId, riskLevel: "high", requestId: request.headers.get("cf-ray"), ip: request.headers.get("cf-connecting-ip") });
      return Response.json({ delivery: await runPlatformDeliveryJob(payload.applicationId, actor) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (["start_trial", "reactivate", "cancel", "reconcile"].includes(payload.action || "")) {
      if (!payload.applicationId) return error("请选择商户后再执行套餐操作。");
      const commercial = await managePlatformSubscription(payload.applicationId, payload.action as "start_trial" | "reactivate" | "cancel" | "reconcile", actor, { trialDays: payload.trialDays });
      return Response.json({ commercial }, { headers: { "Cache-Control": "no-store" } });
    }
    if (payload.action === "create_renewal") {
      if (!payload.applicationId) return error("请选择商户后再生成续费账单。");
      return Response.json({ commercial: await createPlatformRenewalInvoice(payload.applicationId, actor) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (["payment_paid", "payment_failed"].includes(payload.action || "")) {
      if (!payload.invoiceId) return error("请选择要处理的账单。");
      return Response.json({ commercial: await recordPlatformPayment({ invoiceId: payload.invoiceId, status: payload.action === "payment_paid" ? "paid" : "failed", provider: "manual", providerReference: payload.providerReference, failureReason: payload.failureReason }, actor) }, { headers: { "Cache-Control": "no-store" } });
    }
    return error("不支持的套餐操作。");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "套餐操作失败。";
    return error(message, message === "FORBIDDEN" ? 403 : message === "RATE_LIMITED" ? 429 : 409);
  }
}
