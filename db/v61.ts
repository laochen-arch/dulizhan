import { env } from "cloudflare:workers";
import { createSiteFromTemplate } from "./cms";
import { getCmsDatabase } from "./cms";
import { upsertMerchantMember } from "./v25";
import { applyPlatformApplicationToSite, getPlatformApplication, recordPlatformApplicationEvent, updatePlatformApplication } from "./v32";
import { ensurePlatformCommercialSchema, getPlatformCommercialSnapshot, managePlatformSubscription, recordPlatformPayment, type PlatformActor } from "./v34";

type Row = Record<string, unknown>;
type PlatformPayPalEnv = {
  PLATFORM_PAYPAL_CLIENT_ID?: string;
  PLATFORM_PAYPAL_CLIENT_SECRET?: string;
  PLATFORM_PAYPAL_WEBHOOK_ID?: string;
  PLATFORM_PAYPAL_ENVIRONMENT?: string;
  PLATFORM_PAYPAL_PLAN_STARTER_MONTHLY?: string;
  PLATFORM_PAYPAL_PLAN_STARTER_ANNUAL?: string;
  PLATFORM_PAYPAL_PLAN_GROWTH_MONTHLY?: string;
  PLATFORM_PAYPAL_PLAN_GROWTH_ANNUAL?: string;
  PLATFORM_PAYPAL_PLAN_SCALE_MONTHLY?: string;
  PLATFORM_PAYPAL_PLAN_SCALE_ANNUAL?: string;
};

const systemActor: PlatformActor = { userId: "system:v61", email: "system@northlinesupply.com", role: "platform" };
const retryAfter = (attempts: number) => new Date(Date.now() + Math.min(24, 2 ** Math.max(0, attempts - 1)) * 60 * 60 * 1000).toISOString();
const now = () => new Date().toISOString();
const safeText = (value: unknown, max = 500) => typeof value === "string" ? value.slice(0, max) : "";

export async function ensureV61Schema() {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const statements = [
    "ALTER TABLE platform_plans ADD COLUMN paypal_monthly_plan_id TEXT",
    "ALTER TABLE platform_plans ADD COLUMN paypal_annual_plan_id TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN provider TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN provider_subscription_id TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN provider_plan_id TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN provider_status TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN provider_updated_at TEXT",
    "ALTER TABLE platform_subscriptions ADD COLUMN entitlement_status TEXT NOT NULL DEFAULT 'pending'",
    "ALTER TABLE platform_subscriptions ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE platform_subscriptions ADD COLUMN next_retry_at TEXT",
  ];
  for (const statement of statements) { try { await database.prepare(statement).run(); } catch { /* additive migration already applied */ } }
  await database.batch([
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_provider_idx ON platform_subscriptions(provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_billing_webhook_events (id TEXT PRIMARY KEY, provider_event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, resource_id TEXT, application_id TEXT, status TEXT NOT NULL DEFAULT 'processing', payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1, next_retry_at TEXT, last_error TEXT, received_at TEXT NOT NULL, processed_at TEXT)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_billing_webhook_retry_idx ON platform_billing_webhook_events(status, next_retry_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_delivery_jobs (id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE, idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', current_step TEXT NOT NULL DEFAULT 'validate', template_site_id TEXT, site_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_delivery_jobs_retry_idx ON platform_delivery_jobs(status, next_retry_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_security_events (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, risk_level TEXT NOT NULL DEFAULT 'normal', request_id TEXT, ip_hash TEXT, metadata_json TEXT, created_at TEXT NOT NULL)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_security_events_created_idx ON platform_security_events(created_at DESC, risk_level)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_rate_limits (bucket_key TEXT PRIMARY KEY, scope TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_rate_limits_expiry_idx ON platform_rate_limits(expires_at)"),
  ]);
}

function paypalConfig() {
  const values = env as unknown as PlatformPayPalEnv;
  const environment = values.PLATFORM_PAYPAL_ENVIRONMENT?.toLowerCase() === "live" ? "live" : "sandbox";
  return {
    clientId: values.PLATFORM_PAYPAL_CLIENT_ID?.trim() || "",
    clientSecret: values.PLATFORM_PAYPAL_CLIENT_SECRET?.trim() || "",
    webhookId: values.PLATFORM_PAYPAL_WEBHOOK_ID?.trim() || "",
    environment,
    baseUrl: environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    plans: {
      "starter:monthly": values.PLATFORM_PAYPAL_PLAN_STARTER_MONTHLY?.trim() || "",
      "starter:annual": values.PLATFORM_PAYPAL_PLAN_STARTER_ANNUAL?.trim() || "",
      "growth:monthly": values.PLATFORM_PAYPAL_PLAN_GROWTH_MONTHLY?.trim() || "",
      "growth:annual": values.PLATFORM_PAYPAL_PLAN_GROWTH_ANNUAL?.trim() || "",
      "scale:monthly": values.PLATFORM_PAYPAL_PLAN_SCALE_MONTHLY?.trim() || "",
      "scale:annual": values.PLATFORM_PAYPAL_PLAN_SCALE_ANNUAL?.trim() || "",
    } as Record<string, string>,
  };
}

async function paypalToken() {
  const config = paypalConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("PLATFORM_PAYPAL_NOT_CONFIGURED");
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("PLATFORM_PAYPAL_AUTH_FAILED");
  return { token: body.access_token, config };
}

async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function getPlatformPayPalReadiness() {
  const config = paypalConfig();
  return { configured: Boolean(config.clientId && config.clientSecret && config.webhookId), environment: config.environment, webhook: Boolean(config.webhookId), plans: Object.fromEntries(Object.entries(config.plans).map(([key, value]) => [key, Boolean(value)])) };
}

export async function createPlatformPayPalSubscription(applicationId: string, returnBaseUrl: string, actor: PlatformActor) {
  await ensureV61Schema();
  const application = await getPlatformApplication(applicationId);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  if (actor.role === "applicant" && actor.userId !== application.userId && actor.email.toLowerCase() !== application.email.toLowerCase() && actor.userId !== `application:${application.id}`) throw new Error("FORBIDDEN");
  const commercial = await getPlatformCommercialSnapshot(applicationId);
  if (!commercial.subscription || !commercial.agreement) throw new Error("AGREEMENT_REQUIRED");
  const session = await paypalToken();
  const key = `${commercial.subscription.planId}:${commercial.subscription.billingInterval}`;
  const providerPlanId = session.config.plans[key];
  if (!providerPlanId) throw new Error("PLATFORM_PAYPAL_PLAN_NOT_CONFIGURED");
  const database = getCmsDatabase();
  const existing = await database.prepare("SELECT provider_subscription_id AS providerSubscriptionId, provider_status AS providerStatus FROM platform_subscriptions WHERE application_id = ?1").bind(applicationId).first<{ providerSubscriptionId: string | null; providerStatus: string | null }>();
  if (existing?.providerSubscriptionId && !["CANCELLED", "EXPIRED"].includes(existing.providerStatus || "")) {
    return { id: existing.providerSubscriptionId, status: existing.providerStatus, approveUrl: null, reused: true };
  }
  const requestId = `v61-${commercial.subscription.id}`.slice(0, 108);
  const response = await fetch(`${session.config.baseUrl}/v1/billing/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
    body: JSON.stringify({ plan_id: providerPlanId, custom_id: applicationId, subscriber: { email_address: application.email }, application_context: { brand_name: "Northline Platform", user_action: "SUBSCRIBE_NOW", return_url: `${returnBaseUrl}/platform/applications?application=${encodeURIComponent(applicationId)}&billing=approved`, cancel_url: `${returnBaseUrl}/platform/applications?application=${encodeURIComponent(applicationId)}&billing=cancelled` } }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; status?: string; links?: Array<{ rel?: string; href?: string }> };
  if (!response.ok || !body.id) throw new Error(`PLATFORM_PAYPAL_CREATE_FAILED:${response.status}`);
  const timestamp = now();
  await database.prepare("UPDATE platform_subscriptions SET provider = 'paypal', provider_subscription_id = ?1, provider_plan_id = ?2, provider_status = ?3, provider_updated_at = ?4, entitlement_status = 'pending', updated_at = ?4 WHERE application_id = ?5").bind(body.id, providerPlanId, body.status || "APPROVAL_PENDING", timestamp, applicationId).run();
  await recordPlatformApplicationEvent(applicationId, { eventType: "platform_paypal_subscription_created", actor, payload: { providerSubscriptionId: body.id, providerStatus: body.status || "APPROVAL_PENDING" } });
  return { id: body.id, status: body.status || "APPROVAL_PENDING", approveUrl: body.links?.find((link) => link.rel === "approve")?.href || null, reused: false };
}

export async function verifyPlatformPayPalWebhook(payload: string, headers: Headers) {
  const required = { auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"), transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"), transmission_time: headers.get("paypal-transmission-time") };
  if (Object.values(required).some((value) => !value)) return false;
  try {
    const session = await paypalToken();
    if (!session.config.webhookId) return false;
    const response = await fetch(`${session.config.baseUrl}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...required, webhook_id: session.config.webhookId, webhook_event: JSON.parse(payload) }) });
    const body = await response.json().catch(() => ({})) as { verification_status?: string };
    return response.ok && body.verification_status === "SUCCESS";
  } catch { return false; }
}

type PayPalWebhook = { id: string; event_type: string; create_time?: string; resource?: Record<string, unknown> };
function resourceId(event: PayPalWebhook) { return safeText(event.resource?.id, 160) || safeText(event.resource?.billing_agreement_id, 160); }
async function applicationForEvent(event: PayPalWebhook) {
  const database = getCmsDatabase();
  const customId = safeText(event.resource?.custom_id, 200);
  if (customId) return customId;
  const providerId = safeText(event.resource?.billing_agreement_id, 160) || (event.event_type.startsWith("BILLING.SUBSCRIPTION.") ? resourceId(event) : "");
  if (!providerId) return "";
  const row = await database.prepare("SELECT application_id AS applicationId FROM platform_subscriptions WHERE provider_subscription_id = ?1").bind(providerId).first<{ applicationId: string }>();
  return row?.applicationId || "";
}

async function processPlatformPayPalEventInternal(event: PayPalWebhook) {
  const database = getCmsDatabase();
  const applicationId = await applicationForEvent(event);
  if (!applicationId) throw new Error("PLATFORM_SUBSCRIPTION_NOT_FOUND");
  const commercial = await getPlatformCommercialSnapshot(applicationId);
  if (!commercial.subscription) throw new Error("PLATFORM_SUBSCRIPTION_NOT_FOUND");
  const providerStatus = safeText(event.resource?.status, 60) || event.event_type.replace("BILLING.SUBSCRIPTION.", "");
  const eventTime = event.create_time || now();
  const current = await database.prepare("SELECT provider_updated_at AS providerUpdatedAt FROM platform_subscriptions WHERE application_id = ?1").bind(applicationId).first<{ providerUpdatedAt: string | null }>();
  if (current?.providerUpdatedAt && eventTime < current.providerUpdatedAt && !event.event_type.includes("PAYMENT.SALE.COMPLETED")) return { applicationId, ignored: "stale_event" };
  if (["BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.RE-ACTIVATED"].includes(event.event_type)) {
    const trialActive = commercial.subscription.status === "trialing" && Boolean(commercial.subscription.trialEndsAt && commercial.subscription.trialEndsAt > eventTime);
    await database.prepare("UPDATE platform_subscriptions SET provider_status = ?1, provider_updated_at = ?2, entitlement_status = CASE WHEN ?3 = 1 THEN 'active' WHEN status = 'active' THEN 'active' ELSE 'pending' END, failed_attempts = 0, next_retry_at = NULL, grace_until = CASE WHEN status = 'active' THEN NULL ELSE grace_until END, updated_at = ?2 WHERE application_id = ?4").bind(providerStatus, eventTime, trialActive ? 1 : 0, applicationId).run();
  } else if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    const amount = event.resource?.amount as { total?: string; value?: string; currency?: string; currency_code?: string } | undefined;
    const paidAmount = Number(amount?.total || amount?.value || 0);
    const currency = String(amount?.currency || amount?.currency_code || "").toUpperCase();
    const openInvoices = commercial.invoices.filter((item) => ["open", "failed"].includes(item.status) && item.currency.toUpperCase() === currency);
    let matched = openInvoices.filter((item) => Math.abs(item.amount - paidAmount) <= 0.01).slice(0, 1);
    if (!matched.length) {
      const recurring = openInvoices.find((item) => ["recurring", "renewal"].includes(item.kind));
      const setup = openInvoices.find((item) => item.kind === "setup");
      if (recurring && setup && Math.abs(recurring.amount + setup.amount - paidAmount) <= 0.01) matched = [setup, recurring];
    }
    if (!matched.length) throw new Error(openInvoices.length ? "PLATFORM_PAYMENT_AMOUNT_MISMATCH" : "PLATFORM_INVOICE_NOT_FOUND");
    for (const invoice of matched) await recordPlatformPayment({ invoiceId: invoice.id, status: "paid", provider: "paypal", providerReference: resourceId(event) }, systemActor);
    const activatingPayment = matched.some((invoice) => ["recurring", "renewal"].includes(invoice.kind));
    await database.prepare("UPDATE platform_subscriptions SET entitlement_status = CASE WHEN ?1 = 1 THEN 'active' ELSE entitlement_status END, provider_status = 'ACTIVE', provider_updated_at = ?2, failed_attempts = 0, next_retry_at = NULL WHERE application_id = ?3").bind(activatingPayment ? 1 : 0, eventTime, applicationId).run();
    if (activatingPayment) {
      const paidApplication = await getPlatformApplication(applicationId);
      if (paidApplication?.status === "suspended") await updatePlatformApplication(applicationId, { status: "live", adminNote: "PayPal 续费到账，平台服务已自动恢复。" }, systemActor);
    }
  } else if (["BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.DENIED"].includes(event.event_type)) {
    const attempts = Number((await database.prepare("SELECT failed_attempts AS failedAttempts FROM platform_subscriptions WHERE application_id = ?1").bind(applicationId).first<{ failedAttempts: number }>())?.failedAttempts || 0) + 1;
    const graceUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    await database.prepare("UPDATE platform_subscriptions SET status = 'past_due', entitlement_status = 'grace', provider_status = ?1, provider_updated_at = ?2, failed_attempts = ?3, next_retry_at = ?4, grace_until = ?5, updated_at = ?2 WHERE application_id = ?6").bind(providerStatus, eventTime, attempts, retryAfter(attempts), graceUntil, applicationId).run();
    await recordPlatformApplicationEvent(applicationId, { eventType: "platform_paypal_payment_failed", actor: systemActor, payload: { attempts, graceUntil } });
  } else if (["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.SUSPENDED"].includes(event.event_type)) {
    const cancelledWithAccess = event.event_type.endsWith("CANCELLED") && Boolean(commercial.subscription.currentPeriodEnd && commercial.subscription.currentPeriodEnd > eventTime && commercial.subscription.entitlementStatus === "active");
    const terminal = event.event_type.endsWith("CANCELLED") ? "cancelled" : event.event_type.endsWith("EXPIRED") ? "expired" : "past_due";
    await database.prepare("UPDATE platform_subscriptions SET status = ?1, entitlement_status = ?2, cancel_at_period_end = ?3, provider_status = ?4, provider_updated_at = ?5, next_retry_at = ?6, updated_at = ?5 WHERE application_id = ?7").bind(terminal, cancelledWithAccess ? "active" : "suspended", cancelledWithAccess ? 1 : 0, providerStatus, eventTime, cancelledWithAccess ? commercial.subscription.currentPeriodEnd : null, applicationId).run();
    if (!cancelledWithAccess) {
      const app = await getPlatformApplication(applicationId);
      if (app?.status === "live") await updatePlatformApplication(applicationId, { status: "suspended", adminNote: "PayPal 订阅已停止，平台服务已暂停。" }, systemActor);
    }
  }
  await recordPlatformApplicationEvent(applicationId, { eventType: "platform_paypal_webhook_processed", actor: systemActor, payload: { providerEventId: event.id, providerEventType: event.event_type } });
  return { applicationId, processed: true };
}

export async function processPlatformPayPalWebhook(event: PayPalWebhook, retry = false) {
  await ensureV61Schema();
  const database = getCmsDatabase();
  const payload = JSON.stringify(event);
  if (!retry) {
    const claim = await database.prepare("INSERT OR IGNORE INTO platform_billing_webhook_events (id, provider_event_id, event_type, resource_id, application_id, status, payload_json, payload_hash, attempts, next_retry_at, last_error, received_at, processed_at) VALUES (?1, ?2, ?3, ?4, NULL, 'processing', ?5, ?6, 1, NULL, NULL, ?7, NULL)").bind(`platform_webhook_${crypto.randomUUID()}`, event.id, event.event_type, resourceId(event) || null, payload, await sha256(payload), now()).run();
    if (Number((claim as { meta?: { changes?: number } }).meta?.changes || 0) === 0) {
      const row = await database.prepare("SELECT status FROM platform_billing_webhook_events WHERE provider_event_id = ?1").bind(event.id).first<{ status: string }>();
      return { duplicate: true, status: row?.status || "unknown" };
    }
  }
  try {
    const result = await processPlatformPayPalEventInternal(event);
    await database.prepare("UPDATE platform_billing_webhook_events SET application_id = ?1, status = 'completed', processed_at = ?2, next_retry_at = NULL, last_error = NULL WHERE provider_event_id = ?3").bind(result.applicationId, now(), event.id).run();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_WEBHOOK_PROCESSING_FAILED";
    const row = await database.prepare("SELECT attempts FROM platform_billing_webhook_events WHERE provider_event_id = ?1").bind(event.id).first<{ attempts: number }>();
    const attempts = Number(row?.attempts || 1);
    await database.prepare("UPDATE platform_billing_webhook_events SET status = ?1, attempts = ?2, next_retry_at = ?3, last_error = ?4 WHERE provider_event_id = ?5").bind(attempts >= 5 ? "dead_letter" : "failed", attempts + 1, attempts >= 5 ? null : retryAfter(attempts), message.slice(0, 500), event.id).run();
    throw error;
  }
}

function deliverySlug(name: string, applicationId: string) { return `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "merchant-store"}-${applicationId.slice(-6)}`; }

export async function runPlatformDeliveryJob(applicationId: string, actor: PlatformActor) {
  await ensureV61Schema();
  const application = await getPlatformApplication(applicationId);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  if (!["approved", "commercial_pending", "site_creating", "onboarding_failed"].includes(application.status)) throw new Error("APPLICATION_NOT_APPROVED");
  const database = getCmsDatabase();
  const timestamp = now();
  await database.prepare("INSERT OR IGNORE INTO platform_delivery_jobs (id, application_id, idempotency_key, status, current_step, template_site_id, site_id, attempts, next_retry_at, last_error, created_at, updated_at, completed_at) VALUES (?1, ?2, ?3, 'pending', 'validate', ?4, ?5, 0, NULL, NULL, ?6, ?6, NULL)").bind(`delivery_${crypto.randomUUID()}`, applicationId, `delivery:${applicationId}`, application.templateSiteId || "default", application.assignedSiteId || null, timestamp).run();
  const claim = await database.prepare("UPDATE platform_delivery_jobs SET status = 'processing', attempts = attempts + 1, next_retry_at = NULL, last_error = NULL, updated_at = ?1 WHERE application_id = ?2 AND (status IN ('pending','failed') OR (status = 'processing' AND updated_at < ?3))").bind(timestamp, applicationId, new Date(Date.now() - 10 * 60 * 1000).toISOString()).run();
  if (Number((claim as { meta?: { changes?: number } }).meta?.changes || 0) === 0) return getPlatformDeliveryJob(applicationId);
  await updatePlatformApplication(applicationId, { status: "site_creating", assignedSiteId: application.assignedSiteId, adminNote: "站点交付任务正在执行。" }, actor);
  try {
    let siteId = application.assignedSiteId;
    if (!siteId) {
      const slug = deliverySlug(application.brandName || application.companyName, applicationId);
      const existing = await database.prepare("SELECT id FROM cms_sites WHERE slug = ?1 LIMIT 1").bind(slug).first<{ id: string }>();
      if (existing?.id) siteId = existing.id;
      else {
        await database.prepare("UPDATE platform_delivery_jobs SET current_step = 'create_site', updated_at = ?1 WHERE application_id = ?2").bind(now(), applicationId).run();
        const created = await createSiteFromTemplate(application.brandName || application.companyName, slug, application.templateSiteId || "default", actor.userId, actor.email);
        siteId = created.id;
      }
      await database.prepare("UPDATE platform_applications SET assigned_site_id = ?1, updated_at = ?2 WHERE id = ?3").bind(siteId, now(), applicationId).run();
      await database.prepare("UPDATE platform_delivery_jobs SET site_id = ?1, current_step = 'bind_owner', updated_at = ?2 WHERE application_id = ?3").bind(siteId, now(), applicationId).run();
    }
    await upsertMerchantMember(siteId, { userId: application.userId || `applicant:${application.email}`, email: application.email, role: "merchant_owner" }, "invited");
    await database.prepare("UPDATE platform_delivery_jobs SET current_step = 'apply_content', updated_at = ?1 WHERE application_id = ?2").bind(now(), applicationId).run();
    await applyPlatformApplicationToSite(applicationId, siteId, actor.userId, actor.email);
    await updatePlatformApplication(applicationId, { status: "site_created", assignedSiteId: siteId, adminNote: "站点已创建，品牌、商品资料和负责人权限已完成隔离。" }, actor);
    await database.prepare("UPDATE platform_delivery_jobs SET status = 'completed', current_step = 'completed', site_id = ?1, completed_at = ?2, updated_at = ?2, next_retry_at = NULL, last_error = NULL WHERE application_id = ?3").bind(siteId, now(), applicationId).run();
    await recordPlatformApplicationEvent(applicationId, { eventType: "platform_delivery_completed", actor, payload: { siteId } });
    return getPlatformDeliveryJob(applicationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_DELIVERY_FAILED";
    const job = await getPlatformDeliveryJob(applicationId);
    const attempts = Number(job?.attempts || 1);
    await database.prepare("UPDATE platform_delivery_jobs SET status = ?1, next_retry_at = ?2, last_error = ?3, updated_at = ?4 WHERE application_id = ?5").bind(attempts >= 5 ? "manual_review" : "failed", attempts >= 5 ? null : retryAfter(attempts), message.slice(0, 500), now(), applicationId).run();
    await updatePlatformApplication(applicationId, { status: "onboarding_failed", assignedSiteId: job?.siteId || application.assignedSiteId, adminNote: `交付失败：${message}。系统将自动重试，连续失败后转人工处理。` }, actor).catch(() => null);
    throw error;
  }
}

export async function getPlatformDeliveryJob(applicationId: string) {
  await ensureV61Schema();
  return getCmsDatabase().prepare("SELECT id, application_id AS applicationId, status, current_step AS currentStep, template_site_id AS templateSiteId, site_id AS siteId, attempts, next_retry_at AS nextRetryAt, last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt FROM platform_delivery_jobs WHERE application_id = ?1").bind(applicationId).first<Row>();
}

export async function recordPlatformSecurityEvent(input: { actor: PlatformActor; action: string; targetType: string; targetId?: string | null; riskLevel?: "normal" | "high" | "critical"; requestId?: string | null; ip?: string | null; metadata?: Record<string, unknown> }) {
  await ensureV61Schema();
  const ipHash = input.ip ? await sha256(input.ip) : null;
  await getCmsDatabase().prepare("INSERT INTO platform_security_events (id, actor_user_id, actor_email, actor_role, action, target_type, target_id, risk_level, request_id, ip_hash, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)").bind(`security_${crypto.randomUUID()}`, input.actor.userId, input.actor.email, input.actor.role, input.action, input.targetType, input.targetId || null, input.riskLevel || "normal", input.requestId || null, ipHash, input.metadata ? JSON.stringify(input.metadata) : null, now()).run();
}

export async function enforcePlatformRateLimit(scope: string, identity: string, maximum = 10, windowSeconds = 60) {
  await ensureV61Schema();
  const database = getCmsDatabase();
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const bucketKey = await sha256(`${scope}:${identity}:${window}`);
  const timestamp = now();
  const expiresAt = new Date((window + 1) * windowSeconds * 1000).toISOString();
  await database.prepare("INSERT INTO platform_rate_limits (bucket_key, scope, attempts, expires_at, updated_at) VALUES (?1, ?2, 1, ?3, ?4) ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1, updated_at = excluded.updated_at").bind(bucketKey, scope, expiresAt, timestamp).run();
  const row = await database.prepare("SELECT attempts FROM platform_rate_limits WHERE bucket_key = ?1").bind(bucketKey).first<{ attempts: number }>();
  if (Math.random() < 0.02) await database.prepare("DELETE FROM platform_rate_limits WHERE expires_at < ?1").bind(timestamp).run();
  if (Number(row?.attempts || 0) > maximum) throw new Error("RATE_LIMITED");
}

export async function runV61PlatformAutomation() {
  await ensureV61Schema();
  const database = getCmsDatabase();
  const outcome = { subscriptions: 0, deliveries: 0, webhooks: 0, errors: [] as string[] };
  const subscriptions = await database.prepare("SELECT application_id AS applicationId, provider, status, grace_until AS graceUntil, current_period_end AS currentPeriodEnd, entitlement_status AS entitlementStatus FROM platform_subscriptions WHERE status IN ('trialing','active','past_due','cancelled')").all<{ applicationId: string; provider: string | null; status: string; graceUntil: string | null; currentPeriodEnd: string | null; entitlementStatus: string }>();
  for (const subscription of subscriptions.results) {
    try {
      if (subscription.provider === "paypal" && subscription.status === "cancelled" && subscription.entitlementStatus === "active" && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now()) {
        await database.prepare("UPDATE platform_subscriptions SET entitlement_status = 'suspended', next_retry_at = NULL, updated_at = ?1 WHERE application_id = ?2").bind(now(), subscription.applicationId).run();
        const application = await getPlatformApplication(subscription.applicationId);
        if (application?.status === "live") await updatePlatformApplication(subscription.applicationId, { status: "suspended", adminNote: "套餐已在当前计费周期结束后停止。" }, systemActor);
      } else if (subscription.provider === "paypal" && subscription.status === "past_due" && subscription.graceUntil && subscription.graceUntil <= now()) {
        await database.prepare("UPDATE platform_subscriptions SET status = 'expired', entitlement_status = 'suspended', updated_at = ?1 WHERE application_id = ?2").bind(now(), subscription.applicationId).run();
        const application = await getPlatformApplication(subscription.applicationId);
        if (application?.status === "live") await updatePlatformApplication(subscription.applicationId, { status: "suspended", adminNote: "套餐欠费宽限期已结束，请续费后恢复服务。" }, systemActor);
      } else if (subscription.provider !== "paypal") await managePlatformSubscription(subscription.applicationId, "reconcile", systemActor);
      outcome.subscriptions += 1;
    } catch (error) { outcome.errors.push(`subscription:${subscription.applicationId}:${error instanceof Error ? error.message : "failed"}`); }
  }
  const deliveries = await database.prepare("SELECT application_id AS applicationId FROM platform_delivery_jobs WHERE status = 'failed' AND attempts < 5 AND next_retry_at <= ?1 LIMIT 10").bind(now()).all<{ applicationId: string }>();
  for (const job of deliveries.results) { try { await runPlatformDeliveryJob(job.applicationId, systemActor); outcome.deliveries += 1; } catch (error) { outcome.errors.push(`delivery:${job.applicationId}:${error instanceof Error ? error.message : "failed"}`); } }
  const webhooks = await database.prepare("SELECT payload_json AS payloadJson FROM platform_billing_webhook_events WHERE status = 'failed' AND attempts < 5 AND next_retry_at <= ?1 LIMIT 20").bind(now()).all<{ payloadJson: string }>();
  for (const item of webhooks.results) { try { await processPlatformPayPalWebhook(JSON.parse(item.payloadJson) as PayPalWebhook, true); outcome.webhooks += 1; } catch (error) { outcome.errors.push(`webhook:${error instanceof Error ? error.message : "failed"}`); } }
  return outcome;
}

export async function getV61OperationsSnapshot() {
  await ensureV61Schema();
  const database = getCmsDatabase();
  const [delivery, webhook, security] = await Promise.all([
    database.prepare("SELECT id, application_id AS applicationId, status, current_step AS currentStep, site_id AS siteId, attempts, next_retry_at AS nextRetryAt, last_error AS lastError, updated_at AS updatedAt FROM platform_delivery_jobs ORDER BY updated_at DESC LIMIT 100").all<Row>(),
    database.prepare("SELECT provider_event_id AS providerEventId, event_type AS eventType, application_id AS applicationId, status, attempts, next_retry_at AS nextRetryAt, last_error AS lastError, received_at AS receivedAt, processed_at AS processedAt FROM platform_billing_webhook_events ORDER BY received_at DESC LIMIT 100").all<Row>(),
    database.prepare("SELECT actor_email AS actorEmail, actor_role AS actorRole, action, target_type AS targetType, target_id AS targetId, risk_level AS riskLevel, request_id AS requestId, created_at AS createdAt FROM platform_security_events ORDER BY created_at DESC LIMIT 100").all<Row>(),
  ]);
  return { paypal: await getPlatformPayPalReadiness(), deliveries: delivery.results, webhooks: webhook.results, securityEvents: security.results };
}
