import { ensureCmsSchema, getCmsDatabase, recordAudit } from "./cms";
import { getPlatformPlan as getSeedPlan, platformPlans, type PlatformPlan } from "../app/platform/platform-plans";
import { getPlatformApplication, recordPlatformApplicationEvent } from "./v32";

export type PlatformActor = { userId: string; email: string; role: "platform" | "applicant" };
export type BillingInterval = "monthly" | "annual";
export type SubscriptionStatus = "draft" | "pending_signature" | "trialing" | "active" | "past_due" | "cancelled" | "expired";

export type PlatformSubscription = {
  id: string;
  applicationId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currency: string;
  setupFee: number;
  recurringFee: number;
  serviceFeePercent: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  graceUntil: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  agreementId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAgreement = {
  id: string;
  applicationId: string;
  subscriptionId: string;
  agreementVersion: string;
  planSnapshot: PlatformPlan;
  signerUserId: string;
  signerEmail: string;
  status: "pending" | "signed" | "voided";
  signedAt: string | null;
  createdAt: string;
};

export type PlatformInvoice = {
  id: string;
  applicationId: string;
  subscriptionId: string;
  invoiceNumber: string;
  kind: "setup" | "recurring" | "renewal" | "service_fee";
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "failed" | "void" | "refunded";
  dueAt: string;
  paidAt: string | null;
  paymentProvider: string | null;
  providerReference: string | null;
  retryCount: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformPayment = {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: "created" | "pending" | "paid" | "failed" | "refunded";
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformReferral = {
  id: string;
  code: string;
  applicationId: string;
  referredEmail: string;
  status: "applied" | "qualified" | "rewarded" | "rejected";
  rewardAmount: number;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  createdAt: string;
};

export type PlatformReferralReward = {
  id: string;
  referralId: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled";
  paidAt: string | null;
  createdAt: string;
};

export type PlatformCommercialSnapshot = {
  plan: PlatformPlan | null;
  subscription: PlatformSubscription | null;
  agreement: PlatformAgreement | null;
  invoices: PlatformInvoice[];
  payments: PlatformPayment[];
  referral: PlatformReferral | null;
};

export type PlatformReferralCenter = {
  codes: Array<{ id: string; code: string; rewardAmount: number; status: string; createdAt: string }>;
  referrals: PlatformReferral[];
  rewards: PlatformReferralReward[];
};

type Row = Record<string, unknown>;

function now() { return new Date().toISOString(); }
function isoAfterDays(days: number) { return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(); }
function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function planFromRow(row: Row): PlatformPlan {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ""),
    currency: String(row.currency || "USD"),
    setupFee: Number(row.setupFee || 0),
    monthlyFee: Number(row.monthlyFee || 0),
    annualFee: Number(row.annualFee || 0),
    serviceFeePercent: Number(row.serviceFeePercent || 0),
    referralReward: Number(row.referralReward || 0),
    features: parseJson<string[]>(row.featuresJson, []),
  };
}
function subscriptionFromRow(row: Row): PlatformSubscription {
  return {
    id: String(row.id), applicationId: String(row.applicationId), planId: String(row.planId),
    status: ["draft", "pending_signature", "trialing", "active", "past_due", "cancelled", "expired"].includes(String(row.status)) ? String(row.status) as SubscriptionStatus : "draft",
    billingInterval: row.billingInterval === "annual" ? "annual" : "monthly", currency: String(row.currency || "USD"),
    setupFee: Number(row.setupFee || 0), recurringFee: Number(row.recurringFee || 0), serviceFeePercent: Number(row.serviceFeePercent || 0),
    currentPeriodStart: row.currentPeriodStart ? String(row.currentPeriodStart) : null, currentPeriodEnd: row.currentPeriodEnd ? String(row.currentPeriodEnd) : null,
    nextBillingAt: row.nextBillingAt ? String(row.nextBillingAt) : null, graceUntil: row.graceUntil ? String(row.graceUntil) : null,
    trialEndsAt: row.trialEndsAt ? String(row.trialEndsAt) : null,
    cancelAtPeriodEnd: Number(row.cancelAtPeriodEnd || 0) === 1, agreementId: row.agreementId ? String(row.agreementId) : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}
function invoiceFromRow(row: Row): PlatformInvoice {
  return {
    id: String(row.id), applicationId: String(row.applicationId), subscriptionId: String(row.subscriptionId), invoiceNumber: String(row.invoiceNumber),
    kind: ["setup", "recurring", "renewal", "service_fee"].includes(String(row.kind)) ? String(row.kind) as PlatformInvoice["kind"] : "recurring",
    amount: Number(row.amount || 0), currency: String(row.currency || "USD"),
    status: ["draft", "open", "paid", "failed", "void", "refunded"].includes(String(row.status)) ? String(row.status) as PlatformInvoice["status"] : "open",
    dueAt: String(row.dueAt), paidAt: row.paidAt ? String(row.paidAt) : null, paymentProvider: row.paymentProvider ? String(row.paymentProvider) : null,
    providerReference: row.providerReference ? String(row.providerReference) : null, retryCount: Number(row.retryCount || 0), failureReason: row.failureReason ? String(row.failureReason) : null,
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}
function paymentFromRow(row: Row): PlatformPayment {
  return { id: String(row.id), invoiceId: String(row.invoiceId), amount: Number(row.amount || 0), currency: String(row.currency || "USD"), status: ["created", "pending", "paid", "failed", "refunded"].includes(String(row.status)) ? String(row.status) as PlatformPayment["status"] : "created", provider: String(row.provider || "manual"), providerReference: row.providerReference ? String(row.providerReference) : null, failureReason: row.failureReason ? String(row.failureReason) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}
function referralFromRow(row: Row): PlatformReferral {
  return { id: String(row.id), code: String(row.code), applicationId: String(row.applicationId), referredEmail: String(row.referredEmail), status: ["applied", "qualified", "rewarded", "rejected"].includes(String(row.status)) ? String(row.status) as PlatformReferral["status"] : "applied", rewardAmount: Number(row.rewardAmount || 0), qualifiedAt: row.qualifiedAt ? String(row.qualifiedAt) : null, rewardedAt: row.rewardedAt ? String(row.rewardedAt) : null, createdAt: String(row.createdAt) };
}
function rewardFromRow(row: Row): PlatformReferralReward {
  return { id: String(row.id), referralId: String(row.referralId), recipientEmail: String(row.recipientEmail), amount: Number(row.amount || 0), currency: String(row.currency || "USD"), status: ["pending", "approved", "paid", "cancelled"].includes(String(row.status)) ? String(row.status) as PlatformReferralReward["status"] : "pending", paidAt: row.paidAt ? String(row.paidAt) : null, createdAt: String(row.createdAt) };
}

export async function ensurePlatformCommercialSchema() {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_plans (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD', setup_fee REAL NOT NULL DEFAULT 0, monthly_fee REAL NOT NULL DEFAULT 0,
      annual_fee REAL NOT NULL DEFAULT 0, service_fee_percent REAL NOT NULL DEFAULT 0, referral_reward REAL NOT NULL DEFAULT 0,
      features_json TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_subscriptions (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      billing_interval TEXT NOT NULL DEFAULT 'monthly', currency TEXT NOT NULL DEFAULT 'USD', setup_fee REAL NOT NULL DEFAULT 0,
      recurring_fee REAL NOT NULL DEFAULT 0, service_fee_percent REAL NOT NULL DEFAULT 0, current_period_start TEXT,
      current_period_end TEXT, next_billing_at TEXT, grace_until TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      agreement_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_agreements (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL, subscription_id TEXT NOT NULL, agreement_version TEXT NOT NULL,
      plan_snapshot TEXT NOT NULL, signer_user_id TEXT NOT NULL, signer_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      signed_at TEXT, created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_billing_invoices (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL, subscription_id TEXT NOT NULL, invoice_number TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'open',
      due_at TEXT NOT NULL, paid_at TEXT, payment_provider TEXT, provider_reference TEXT, idempotency_key TEXT NOT NULL UNIQUE,
      retry_count INTEGER NOT NULL DEFAULT 0, failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_billing_payments (
      id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'created', provider TEXT NOT NULL DEFAULT 'manual', provider_reference TEXT,
      failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_referral_codes (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, referrer_user_id TEXT NOT NULL, referrer_email TEXT NOT NULL,
      reward_amount REAL NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_referrals (
      id TEXT PRIMARY KEY, code_id TEXT NOT NULL, application_id TEXT NOT NULL UNIQUE, referred_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'applied', reward_amount REAL NOT NULL DEFAULT 0, qualified_at TEXT, rewarded_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_referral_rewards (
      id TEXT PRIMARY KEY, referral_id TEXT NOT NULL UNIQUE, recipient_email TEXT NOT NULL, amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT, created_at TEXT NOT NULL
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_subscriptions_status_idx ON platform_subscriptions(status, next_billing_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_invoices_application_idx ON platform_billing_invoices(application_id, status, due_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_referrals_code_idx ON platform_referrals(code_id, status)"),
  ]);
  try { await database.prepare("ALTER TABLE platform_subscriptions ADD COLUMN trial_ends_at TEXT").run(); } catch { /* already present */ }
  const timestamp = now();
  for (const plan of platformPlans) {
    await database.prepare(`INSERT OR IGNORE INTO platform_plans
      (id, code, name, description, currency, setup_fee, monthly_fee, annual_fee, service_fee_percent, referral_reward, features_json, active, display_order, created_at, updated_at)
      VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?12)`)
      .bind(plan.id, plan.name, plan.description, plan.currency, plan.setupFee, plan.monthlyFee, plan.annualFee, plan.serviceFeePercent, plan.referralReward, JSON.stringify(plan.features), platformPlans.indexOf(plan), timestamp).run();
  }
}

export async function listPlatformPlans() {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const rows = await database.prepare(`SELECT id, name, description, currency, setup_fee AS setupFee, monthly_fee AS monthlyFee, annual_fee AS annualFee,
      service_fee_percent AS serviceFeePercent, referral_reward AS referralReward, features_json AS featuresJson
    FROM platform_plans WHERE active = 1 ORDER BY display_order ASC`).all<Row>();
  return rows.results.length ? rows.results.map(planFromRow) : platformPlans;
}

export async function getPlatformPlan(id: string) {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT id, name, description, currency, setup_fee AS setupFee, monthly_fee AS monthlyFee, annual_fee AS annualFee,
      service_fee_percent AS serviceFeePercent, referral_reward AS referralReward, features_json AS featuresJson
    FROM platform_plans WHERE id = ?1 AND active = 1`).bind(id).first<Row>();
  return row ? planFromRow(row) : getSeedPlan(id);
}

async function assertApplication(applicationId: string, actor: PlatformActor) {
  const application = await getPlatformApplication(applicationId);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  if (actor.role === "applicant" && actor.userId !== application.userId && actor.email.toLowerCase() !== application.email.toLowerCase() && actor.userId !== `application:${application.id}`) throw new Error("FORBIDDEN");
  return application;
}

async function getSubscription(applicationId: string) {
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT id, application_id AS applicationId, plan_id AS planId, status, billing_interval AS billingInterval,
      currency, setup_fee AS setupFee, recurring_fee AS recurringFee, service_fee_percent AS serviceFeePercent, current_period_start AS currentPeriodStart,
      current_period_end AS currentPeriodEnd, next_billing_at AS nextBillingAt, grace_until AS graceUntil, trial_ends_at AS trialEndsAt, cancel_at_period_end AS cancelAtPeriodEnd,
      agreement_id AS agreementId, created_at AS createdAt, updated_at AS updatedAt FROM platform_subscriptions WHERE application_id = ?1`).bind(applicationId).first<Row>();
  return row ? subscriptionFromRow(row) : null;
}

async function ensureInvoice(input: { applicationId: string; subscriptionId: string; kind: PlatformInvoice["kind"]; amount: number; currency: string; dueAt: string; idempotencyKey: string }) {
  const database = getCmsDatabase();
  const existing = await database.prepare(`SELECT id, application_id AS applicationId, subscription_id AS subscriptionId, invoice_number AS invoiceNumber, kind, amount, currency, status, due_at AS dueAt,
      paid_at AS paidAt, payment_provider AS paymentProvider, provider_reference AS providerReference, retry_count AS retryCount, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_billing_invoices WHERE idempotency_key = ?1`).bind(input.idempotencyKey).first<Row>();
  if (existing) return invoiceFromRow(existing);
  const timestamp = now();
  const id = `platform_invoice_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO platform_billing_invoices
    (id, application_id, subscription_id, invoice_number, kind, amount, currency, status, due_at, paid_at, payment_provider, provider_reference, idempotency_key, retry_count, failure_reason, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, NULL, NULL, NULL, ?9, 0, NULL, ?10, ?10)`)
    .bind(id, input.applicationId, input.subscriptionId, `PLAT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(-6).toUpperCase()}`, input.kind, input.amount, input.currency, input.dueAt, input.idempotencyKey, timestamp).run();
  return { id, applicationId: input.applicationId, subscriptionId: input.subscriptionId, invoiceNumber: `PLAT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(-6).toUpperCase()}`, kind: input.kind, amount: input.amount, currency: input.currency, status: "open" as const, dueAt: input.dueAt, paidAt: null, paymentProvider: null, providerReference: null, retryCount: 0, failureReason: null, createdAt: timestamp, updatedAt: timestamp };
}

export async function selectPlatformPlan(applicationId: string, planId: string, billingInterval: BillingInterval, actor: PlatformActor) {
  const application = await assertApplication(applicationId, actor);
  const plan = await getPlatformPlan(planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const interval = billingInterval === "annual" ? "annual" : "monthly";
  const database = getCmsDatabase();
  const existing = await getSubscription(applicationId);
  if (existing?.status === "active" && existing.planId !== plan.id) throw new Error("ACTIVE_PLAN_CHANGE_REQUIRES_REVIEW");
  const timestamp = now();
  const id = existing?.id || `platform_subscription_${crypto.randomUUID()}`;
  const recurringFee = interval === "annual" ? plan.annualFee : plan.monthlyFee;
  await database.prepare(`INSERT INTO platform_subscriptions
      (id, application_id, plan_id, status, billing_interval, currency, setup_fee, recurring_fee, service_fee_percent, current_period_start, current_period_end, next_billing_at, grace_until, cancel_at_period_end, agreement_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'pending_signature', ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL, NULL, 0, NULL, ?9, ?9)
      ON CONFLICT(application_id) DO UPDATE SET plan_id = excluded.plan_id, billing_interval = excluded.billing_interval, currency = excluded.currency, setup_fee = excluded.setup_fee, recurring_fee = excluded.recurring_fee, service_fee_percent = excluded.service_fee_percent, status = CASE WHEN platform_subscriptions.status = 'active' THEN platform_subscriptions.status ELSE 'pending_signature' END, updated_at = excluded.updated_at`)
    .bind(id, applicationId, plan.id, interval, plan.currency, plan.setupFee, recurringFee, plan.serviceFeePercent, timestamp).run();
  await ensureInvoice({ applicationId, subscriptionId: id, kind: "setup", amount: plan.setupFee, currency: plan.currency, dueAt: isoAfterDays(7), idempotencyKey: `setup:${id}` });
  await recordPlatformApplicationEvent(applicationId, { eventType: "plan_selected", actor, payload: { planId: plan.id, billingInterval: interval } });
  if (application.assignedSiteId) await recordAudit(database, application.assignedSiteId, { userId: actor.userId, email: actor.email }, "platform.plan.selected", "platform_application", applicationId, { planId: plan.id, billingInterval: interval });
  return getPlatformCommercialSnapshot(applicationId);
}

export async function signPlatformAgreement(applicationId: string, actor: PlatformActor) {
  const application = await assertApplication(applicationId, actor);
  const subscription = await getSubscription(applicationId);
  if (!subscription) throw new Error("PLAN_REQUIRED");
  const plan = await getPlatformPlan(subscription.planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const database = getCmsDatabase();
  const existing = await database.prepare(`SELECT id FROM platform_agreements WHERE subscription_id = ?1 AND status = 'signed' ORDER BY signed_at DESC LIMIT 1`).bind(subscription.id).first<{ id: string }>();
  if (existing) return getPlatformCommercialSnapshot(applicationId);
  const timestamp = now();
  const agreementId = `platform_agreement_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO platform_agreements (id, application_id, subscription_id, agreement_version, plan_snapshot, signer_user_id, signer_email, status, signed_at, created_at)
    VALUES (?1, ?2, ?3, 'platform-commercial-v1', ?4, ?5, ?6, 'signed', ?7, ?7)`)
    .bind(agreementId, applicationId, subscription.id, JSON.stringify(plan), actor.userId, actor.email, timestamp).run();
  const periodEnd = subscription.billingInterval === "annual" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await database.prepare(`UPDATE platform_subscriptions SET status = 'active', agreement_id = ?1, current_period_start = ?2, current_period_end = ?3, next_billing_at = ?3, updated_at = ?2 WHERE id = ?4`)
    .bind(agreementId, timestamp, periodEnd, subscription.id).run();
  await ensureInvoice({ applicationId, subscriptionId: subscription.id, kind: "recurring", amount: subscription.recurringFee, currency: subscription.currency, dueAt: periodEnd, idempotencyKey: `recurring:${subscription.id}:${periodEnd.slice(0, 10)}` });
  await recordPlatformApplicationEvent(applicationId, { eventType: "agreement_signed", actor, note: "Platform commercial agreement signed online.", payload: { agreementId, planId: plan.id } });
  if (application.assignedSiteId) await recordAudit(database, application.assignedSiteId, { userId: actor.userId, email: actor.email }, "platform.agreement.signed", "platform_agreement", agreementId, { planId: plan.id });
  return getPlatformCommercialSnapshot(applicationId);
}

export async function createPlatformRenewalInvoice(applicationId: string, actor: PlatformActor) {
  await assertApplication(applicationId, actor);
  const subscription = await getSubscription(applicationId);
  if (!subscription || !["active", "past_due"].includes(subscription.status)) throw new Error("SUBSCRIPTION_NOT_ACTIVE");
  const dueAt = isoAfterDays(7);
  const key = `renewal:${subscription.id}:${subscription.nextBillingAt || dueAt.slice(0, 10)}`;
  const invoice = await ensureInvoice({ applicationId, subscriptionId: subscription.id, kind: "renewal", amount: subscription.recurringFee, currency: subscription.currency, dueAt, idempotencyKey: key });
  await recordPlatformApplicationEvent(applicationId, { eventType: "renewal_invoice_created", actor, payload: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber } });
  return getPlatformCommercialSnapshot(applicationId);
}

export async function managePlatformSubscription(applicationId: string, action: "start_trial" | "reactivate" | "cancel" | "reconcile", actor: PlatformActor, options: { trialDays?: number } = {}) {
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  const application = await assertApplication(applicationId, actor);
  const subscription = await getSubscription(applicationId);
  if (!subscription) throw new Error("PLAN_REQUIRED");
  const database = getCmsDatabase();
  const timestamp = now();
  if (action === "start_trial") {
    if (!["draft", "pending_signature", "expired", "cancelled"].includes(subscription.status)) throw new Error("TRIAL_NOT_AVAILABLE");
    const days = Math.min(60, Math.max(1, Math.floor(options.trialDays || 14)));
    const trialEndsAt = isoAfterDays(days);
    await database.prepare("UPDATE platform_subscriptions SET status = 'trialing', current_period_start = ?1, current_period_end = ?2, next_billing_at = ?2, trial_ends_at = ?2, grace_until = NULL, cancel_at_period_end = 0, updated_at = ?1 WHERE id = ?3")
      .bind(timestamp, trialEndsAt, subscription.id).run();
    await recordPlatformApplicationEvent(applicationId, { eventType: "platform_trial_started", actor, payload: { trialDays: days, trialEndsAt } });
  } else if (action === "reactivate") {
    const periodEnd = subscription.billingInterval === "annual" ? isoAfterDays(365) : isoAfterDays(30);
    await database.prepare("UPDATE platform_subscriptions SET status = 'active', current_period_start = ?1, current_period_end = ?2, next_billing_at = ?2, trial_ends_at = NULL, grace_until = NULL, cancel_at_period_end = 0, updated_at = ?1 WHERE id = ?3")
      .bind(timestamp, periodEnd, subscription.id).run();
    await recordPlatformApplicationEvent(applicationId, { eventType: "platform_subscription_reactivated", actor, payload: { periodEnd } });
  } else if (action === "cancel") {
    await database.prepare("UPDATE platform_subscriptions SET status = 'cancelled', cancel_at_period_end = 0, next_billing_at = NULL, grace_until = NULL, updated_at = ?1 WHERE id = ?2").bind(timestamp, subscription.id).run();
    await recordPlatformApplicationEvent(applicationId, { eventType: "platform_subscription_cancelled", actor });
    if (application.assignedSiteId && application.status === "live") {
      await database.prepare("UPDATE platform_applications SET status = 'suspended', admin_note = ?1, updated_at = ?2 WHERE id = ?3").bind("套餐已取消，站点暂停续费服务。", timestamp, applicationId).run();
    }
  } else {
    const due = subscription.trialEndsAt || subscription.nextBillingAt;
    if (due && due <= timestamp && ["trialing", "active"].includes(subscription.status)) {
      const invoice = await ensureInvoice({ applicationId, subscriptionId: subscription.id, kind: "renewal", amount: subscription.recurringFee, currency: subscription.currency, dueAt: timestamp, idempotencyKey: `due:${subscription.id}:${due.slice(0, 10)}` });
      const graceUntil = isoAfterDays(7);
      await database.prepare("UPDATE platform_subscriptions SET status = 'past_due', grace_until = ?1, updated_at = ?2 WHERE id = ?3").bind(graceUntil, timestamp, subscription.id).run();
      await recordPlatformApplicationEvent(applicationId, { eventType: "platform_subscription_past_due", actor, payload: { invoiceId: invoice.id, graceUntil } });
    } else if (subscription.status === "past_due" && subscription.graceUntil && subscription.graceUntil <= timestamp) {
      await database.prepare("UPDATE platform_subscriptions SET status = 'expired', updated_at = ?1 WHERE id = ?2").bind(timestamp, subscription.id).run();
      await database.prepare("UPDATE platform_applications SET status = CASE WHEN status = 'live' THEN 'suspended' ELSE status END, admin_note = ?1, updated_at = ?2 WHERE id = ?3").bind("套餐欠费宽限期已结束，请续费后恢复服务。", timestamp, applicationId).run();
      await recordPlatformApplicationEvent(applicationId, { eventType: "platform_subscription_expired", actor });
    }
  }
  if (application.assignedSiteId) await recordAudit(database, application.assignedSiteId, { userId: actor.userId, email: actor.email }, `platform.subscription.${action}`, "platform_subscription", subscription.id);
  return getPlatformCommercialSnapshot(applicationId);
}

export async function recordPlatformPayment(input: { invoiceId: string; status: "paid" | "failed"; provider?: string; providerReference?: string; failureReason?: string }, actor: PlatformActor) {
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const invoiceRow = await database.prepare(`SELECT id, application_id AS applicationId, subscription_id AS subscriptionId, invoice_number AS invoiceNumber, kind, amount, currency, status, due_at AS dueAt, paid_at AS paidAt, payment_provider AS paymentProvider, provider_reference AS providerReference, retry_count AS retryCount, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt FROM platform_billing_invoices WHERE id = ?1`).bind(input.invoiceId).first<Row>();
  if (!invoiceRow) throw new Error("INVOICE_NOT_FOUND");
  const invoice = invoiceFromRow(invoiceRow);
  const timestamp = now();
  await database.prepare(`INSERT INTO platform_billing_payments (id, invoice_id, amount, currency, status, provider, provider_reference, failure_reason, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`).bind(`platform_payment_${crypto.randomUUID()}`, invoice.id, invoice.amount, invoice.currency, input.status, input.provider || "manual", input.providerReference || null, input.failureReason || null, timestamp).run();
  if (input.status === "paid") {
    await database.prepare(`UPDATE platform_billing_invoices SET status = 'paid', paid_at = ?1, payment_provider = ?2, provider_reference = ?3, failure_reason = NULL, updated_at = ?1 WHERE id = ?4`).bind(timestamp, input.provider || "manual", input.providerReference || null, invoice.id).run();
    const subscription = await database.prepare("SELECT billing_interval AS billingInterval FROM platform_subscriptions WHERE id = ?1").bind(invoice.subscriptionId).first<{ billingInterval: string }>();
    const periodEnd = subscription?.billingInterval === "annual" ? isoAfterDays(365) : isoAfterDays(30);
    await database.prepare("UPDATE platform_subscriptions SET status = 'active', current_period_start = ?1, current_period_end = ?2, next_billing_at = ?2, trial_ends_at = NULL, grace_until = NULL, updated_at = ?1 WHERE id = ?3").bind(timestamp, periodEnd, invoice.subscriptionId).run();
  } else {
    await database.prepare(`UPDATE platform_billing_invoices SET status = 'failed', retry_count = retry_count + 1, payment_provider = ?1, provider_reference = ?2, failure_reason = ?3, updated_at = ?4 WHERE id = ?5`).bind(input.provider || "manual", input.providerReference || null, input.failureReason || "Payment could not be confirmed.", timestamp, invoice.id).run();
    await database.prepare("UPDATE platform_subscriptions SET status = 'past_due', grace_until = ?1, updated_at = ?2 WHERE id = ?3").bind(isoAfterDays(7), timestamp, invoice.subscriptionId).run();
  }
  await recordPlatformApplicationEvent(invoice.applicationId, { eventType: input.status === "paid" ? "platform_payment_recorded" : "platform_payment_failed", actor, payload: { invoiceId: invoice.id, status: input.status, provider: input.provider || "manual" } });
  return getPlatformCommercialSnapshot(invoice.applicationId);
}

export async function getPlatformCommercialSnapshot(applicationId: string): Promise<PlatformCommercialSnapshot> {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const subscription = await getSubscription(applicationId);
  const plan = subscription ? await getPlatformPlan(subscription.planId) : null;
  const agreementRow = subscription ? await database.prepare(`SELECT id, application_id AS applicationId, subscription_id AS subscriptionId, agreement_version AS agreementVersion, plan_snapshot AS planSnapshot, signer_user_id AS signerUserId, signer_email AS signerEmail, status, signed_at AS signedAt, created_at AS createdAt FROM platform_agreements WHERE subscription_id = ?1 AND status = 'signed' ORDER BY signed_at DESC LIMIT 1`).bind(subscription.id).first<Row>() : null;
  const invoiceRows = await database.prepare(`SELECT id, application_id AS applicationId, subscription_id AS subscriptionId, invoice_number AS invoiceNumber, kind, amount, currency, status, due_at AS dueAt, paid_at AS paidAt, payment_provider AS paymentProvider, provider_reference AS providerReference, retry_count AS retryCount, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt FROM platform_billing_invoices WHERE application_id = ?1 ORDER BY created_at DESC`).bind(applicationId).all<Row>();
  const paymentRows = await database.prepare(`SELECT id, invoice_id AS invoiceId, amount, currency, status, provider, provider_reference AS providerReference, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt FROM platform_billing_payments WHERE invoice_id IN (SELECT id FROM platform_billing_invoices WHERE application_id = ?1) ORDER BY created_at DESC`).bind(applicationId).all<Row>();
  const referralRow = await database.prepare(`SELECT r.id, c.code, r.application_id AS applicationId, r.referred_email AS referredEmail, r.status, r.reward_amount AS rewardAmount, r.qualified_at AS qualifiedAt, r.rewarded_at AS rewardedAt, r.created_at AS createdAt FROM platform_referrals r JOIN platform_referral_codes c ON c.id = r.code_id WHERE r.application_id = ?1`).bind(applicationId).first<Row>();
  const agreement = agreementRow ? { id: String(agreementRow.id), applicationId: String(agreementRow.applicationId), subscriptionId: String(agreementRow.subscriptionId), agreementVersion: String(agreementRow.agreementVersion), planSnapshot: parseJson<PlatformPlan>(agreementRow.planSnapshot, plan || platformPlans[0]), signerUserId: String(agreementRow.signerUserId), signerEmail: String(agreementRow.signerEmail), status: "signed" as const, signedAt: agreementRow.signedAt ? String(agreementRow.signedAt) : null, createdAt: String(agreementRow.createdAt) } : null;
  return { plan, subscription, agreement, invoices: invoiceRows.results.map(invoiceFromRow), payments: paymentRows.results.map(paymentFromRow), referral: referralRow ? referralFromRow(referralRow) : null };
}

export async function getReferralCodeSummary(code: string) {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const row = await database.prepare("SELECT code, reward_amount AS rewardAmount, status FROM platform_referral_codes WHERE upper(code) = upper(?1)").bind(code.trim()).first<Row>();
  return row && row.status === "active" ? { code: String(row.code), rewardAmount: Number(row.rewardAmount || 0) } : null;
}

export async function createPlatformReferralCode(actor: PlatformActor) {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const existing = await database.prepare("SELECT id, code, reward_amount AS rewardAmount, status, created_at AS createdAt FROM platform_referral_codes WHERE referrer_user_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(actor.userId).first<Row>();
  if (existing) return { id: String(existing.id), code: String(existing.code), rewardAmount: Number(existing.rewardAmount || 0), status: String(existing.status), createdAt: String(existing.createdAt) };
  const rewardAmount = platformPlans[0].referralReward;
  const code = `REF-${actor.userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase()}`;
  const timestamp = now();
  const id = `platform_referral_code_${crypto.randomUUID()}`;
  await database.prepare("INSERT INTO platform_referral_codes (id, code, referrer_user_id, referrer_email, reward_amount, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)").bind(id, code, actor.userId, actor.email, rewardAmount, timestamp).run();
  return { id, code, rewardAmount, status: "active", createdAt: timestamp };
}

export async function attachPlatformReferral(applicationId: string, code: string, actor: PlatformActor) {
  const application = await assertApplication(applicationId, actor);
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const referralCode = await database.prepare("SELECT id, code, referrer_user_id AS referrerUserId, reward_amount AS rewardAmount, status FROM platform_referral_codes WHERE upper(code) = upper(?1)").bind(code.trim()).first<Row>();
  if (!referralCode || referralCode.status !== "active") throw new Error("REFERRAL_CODE_INVALID");
  if (String(referralCode.referrerUserId) === actor.userId || String(referralCode.referrerUserId) === application.userId) throw new Error("REFERRAL_SELF_NOT_ALLOWED");
  const existing = await database.prepare("SELECT id FROM platform_referrals WHERE application_id = ?1").bind(applicationId).first<{ id: string }>();
  if (existing) return getPlatformCommercialSnapshot(applicationId);
  const timestamp = now();
  await database.prepare(`INSERT INTO platform_referrals (id, code_id, application_id, referred_email, status, reward_amount, qualified_at, rewarded_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'applied', ?5, NULL, NULL, ?6, ?6)`).bind(`platform_referral_${crypto.randomUUID()}`, String(referralCode.id), applicationId, application.email, Number(referralCode.rewardAmount || 0), timestamp).run();
  await database.prepare("UPDATE platform_applications SET referral_code = ?, updated_at = ? WHERE id = ?").bind(String(referralCode.code), timestamp, applicationId).run();
  await recordPlatformApplicationEvent(applicationId, { eventType: "referral_applied", actor, payload: { code: referralCode.code } });
  return getPlatformCommercialSnapshot(applicationId);
}

export async function qualifyPlatformReferral(applicationId: string, actor: PlatformActor) {
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT r.id, r.code_id AS codeId, r.application_id AS applicationId, r.referred_email AS referredEmail, r.status, r.reward_amount AS rewardAmount, r.qualified_at AS qualifiedAt, r.rewarded_at AS rewardedAt, r.created_at AS createdAt FROM platform_referrals r WHERE r.application_id = ?1`).bind(applicationId).first<Row>();
  if (!row || ["qualified", "rewarded"].includes(String(row.status))) return getPlatformCommercialSnapshot(applicationId);
  const timestamp = now();
  await database.prepare("UPDATE platform_referrals SET status = 'qualified', qualified_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, String(row.id)).run();
  await database.prepare(`INSERT OR IGNORE INTO platform_referral_rewards (id, referral_id, recipient_email, amount, currency, status, paid_at, created_at)
    VALUES (?1, ?2, (SELECT referrer_email FROM platform_referral_codes WHERE id = ?3), ?4, 'USD', 'pending', NULL, ?5)`).bind(`platform_reward_${crypto.randomUUID()}`, String(row.id), String(row.codeId), Number(row.rewardAmount || 0), timestamp).run();
  await recordPlatformApplicationEvent(applicationId, { eventType: "referral_qualified", actor, payload: { rewardAmount: Number(row.rewardAmount || 0) } });
  return getPlatformCommercialSnapshot(applicationId);
}

export async function listPlatformReferralCenter(actor: PlatformActor): Promise<PlatformReferralCenter> {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const codes = await database.prepare("SELECT id, code, reward_amount AS rewardAmount, status, created_at AS createdAt FROM platform_referral_codes WHERE referrer_user_id = ?1 OR lower(referrer_email) = lower(?2) ORDER BY created_at DESC").bind(actor.userId, actor.email).all<Row>();
  const referrals = await database.prepare(`SELECT r.id, c.code, r.application_id AS applicationId, r.referred_email AS referredEmail, r.status, r.reward_amount AS rewardAmount, r.qualified_at AS qualifiedAt, r.rewarded_at AS rewardedAt, r.created_at AS createdAt FROM platform_referrals r JOIN platform_referral_codes c ON c.id = r.code_id WHERE c.referrer_user_id = ?1 OR lower(c.referrer_email) = lower(?2) ORDER BY r.created_at DESC`).bind(actor.userId, actor.email).all<Row>();
  const rewards = await database.prepare(`SELECT rw.id, rw.referral_id AS referralId, rw.recipient_email AS recipientEmail, rw.amount, rw.currency, rw.status, rw.paid_at AS paidAt, rw.created_at AS createdAt FROM platform_referral_rewards rw JOIN platform_referrals r ON r.id = rw.referral_id JOIN platform_referral_codes c ON c.id = r.code_id WHERE c.referrer_user_id = ?1 OR lower(c.referrer_email) = lower(?2) ORDER BY rw.created_at DESC`).bind(actor.userId, actor.email).all<Row>();
  return { codes: codes.results.map((row) => ({ id: String(row.id), code: String(row.code), rewardAmount: Number(row.rewardAmount || 0), status: String(row.status), createdAt: String(row.createdAt) })), referrals: referrals.results.map(referralFromRow), rewards: rewards.results.map(rewardFromRow) };
}

export async function markPlatformReferralRewardPaid(rewardId: string, actor: PlatformActor) {
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  const reward = await database.prepare("SELECT id, referral_id AS referralId FROM platform_referral_rewards WHERE id = ?1").bind(rewardId).first<Row>();
  if (!reward) throw new Error("REWARD_NOT_FOUND");
  const timestamp = now();
  await database.prepare("UPDATE platform_referral_rewards SET status = 'paid', paid_at = ?1 WHERE id = ?2").bind(timestamp, rewardId).run();
  await database.prepare("UPDATE platform_referrals SET status = 'rewarded', rewarded_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, String(reward.referralId)).run();
  return true;
}
