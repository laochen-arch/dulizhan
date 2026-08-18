import { env } from "cloudflare:workers";
import {
  createPlatformApplicationNotification,
  getPlatformApplication,
  getPlatformApplicationNotification,
  updatePlatformApplicationNotification,
  type PlatformApplication,
  type PlatformApplicationNotification,
} from "../../db/v32";

type NotificationRequest = {
  request: Request;
  application: PlatformApplication;
  eventType: string;
  dedupeKey: string;
  accessToken?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function statusLabel(status: string, locale: PlatformApplication["locale"]) {
  const labels = locale === "zh-CN"
    ? { draft: "草稿", submitted: "已提交", reviewing: "审核中", needs_info: "需要补充资料", approved: "审核通过", rejected: "未通过", site_created: "站点已创建" }
    : { draft: "Draft", submitted: "Submitted", reviewing: "In review", needs_info: "Action required", approved: "Approved", rejected: "Not approved", site_created: "Storefront ready" };
  return labels[status as keyof typeof labels] || status.replaceAll("_", " ");
}

function notificationCopy(application: PlatformApplication, eventType: string) {
  const chinese = application.locale === "zh-CN";
  const status = statusLabel(application.status, application.locale);
  if (chinese) {
    if (eventType === "application_submitted") return { subject: "入驻申请已提交", title: "你的入驻申请已提交", body: "平台团队会在申请工作区更新审核状态。" };
    if (eventType === "supplement_submitted") return { subject: "补充资料已收到", title: "补充资料已收到", body: "平台团队会继续审核这次更新。" };
    if (eventType === "domain_requested") return { subject: "域名接入申请已提交", title: "域名接入申请已提交", body: "平台团队会在申请工作区更新域名处理状态。" };
    if (eventType === "domain_status_changed") return { subject: "域名接入状态已更新", title: "域名接入状态已更新", body: application.adminNote || "请打开申请工作区查看域名处理结果。" };
    return { subject: `入驻申请状态更新：${status}`, title: `申请状态：${status}`, body: application.adminNote || "请打开申请工作区查看下一步操作。" };
  }
  if (eventType === "application_submitted") return { subject: "Your merchant application was submitted", title: "Your application is on its way", body: "The platform team will keep the review status updated in your launch workspace." };
  if (eventType === "supplement_submitted") return { subject: "Your updated launch materials were received", title: "Your updates are back with the platform team", body: "The platform team will continue reviewing the updated application." };
  if (eventType === "domain_requested") return { subject: "Your domain request was submitted", title: "Your domain request is on its way", body: "The platform team will update the domain status in your launch workspace." };
  if (eventType === "domain_status_changed") return { subject: "Your domain request was updated", title: "Your domain request was updated", body: application.adminNote || "Open your launch workspace to see the domain result." };
  return { subject: `Application status update: ${status}`, title: `Application status: ${status}`, body: application.adminNote || "Open your launch workspace to see the next action." };
}

function applicationWorkspaceUrl(request: Request, applicationId: string, accessToken?: string | null) {
  const url = new URL(`/platform/applications?application=${encodeURIComponent(applicationId)}`, request.url);
  if (accessToken) url.searchParams.set("token", accessToken);
  return url.toString();
}

async function deliver(notification: PlatformApplicationNotification, application: PlatformApplication, request: Request, accessToken?: string | null) {
  const bindings = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string };
  const copy = notificationCopy(application, notification.eventType);
  const workspaceUrl = applicationWorkspaceUrl(request, application.id, accessToken);
  let attempts = notification.attempts;

  if (!bindings.RESEND_API_KEY || !bindings.RESEND_FROM_EMAIL) {
    return updatePlatformApplicationNotification(notification.id, { status: "failed", attempts: attempts + 1, lastError: "RESEND_NOT_CONFIGURED" });
  }

  const body = JSON.stringify({
    from: bindings.RESEND_FROM_EMAIL,
    to: [notification.recipient],
    subject: notification.subject,
    html: `<p>${escapeHtml(copy.title)}</p><p>${escapeHtml(copy.body)}</p><p><a href="${escapeHtml(workspaceUrl)}">${escapeHtml(workspaceUrl)}</a></p><p>Application: ${escapeHtml(application.id)}</p>`,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${bindings.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (response.ok) return updatePlatformApplicationNotification(notification.id, { status: "sent", attempts, lastError: null, sentAt: new Date().toISOString() });
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
        return updatePlatformApplicationNotification(notification.id, { status: "failed", attempts, lastError: `RESEND_HTTP_${response.status}` });
      }
    } catch (error) {
      if (attempt === 1) return updatePlatformApplicationNotification(notification.id, { status: "failed", attempts, lastError: error instanceof Error ? error.name === "AbortError" ? "RESEND_TIMEOUT" : "RESEND_NETWORK_ERROR" : "RESEND_NETWORK_ERROR" });
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (attempt === 0) await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }

  return updatePlatformApplicationNotification(notification.id, { status: "failed", attempts, lastError: "RESEND_DELIVERY_FAILED" });
}

export async function sendPlatformApplicationNotification(input: NotificationRequest) {
  const copy = notificationCopy(input.application, input.eventType);
  const notification = await createPlatformApplicationNotification({
    applicationId: input.application.id,
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    recipient: input.application.email,
    subject: copy.subject,
  });
  if (notification.status === "sent") return notification;
  return deliver(notification, input.application, input.request, input.accessToken);
}

export async function retryPlatformApplicationNotification(input: { request: Request; applicationId: string; notificationId: string }) {
  const [application, notification] = await Promise.all([
    getPlatformApplication(input.applicationId),
    getPlatformApplicationNotification(input.notificationId, input.applicationId),
  ]);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
  return deliver(notification, application, input.request);
}
