import { ensureCmsSchema, getCmsDatabase } from "./cms";
import { listPlatformApplications, type PlatformApplication } from "./v32";
import { ensurePlatformCommercialSchema, getPlatformCommercialSnapshot, type PlatformCommercialSnapshot } from "./v34";

type CountRow = { count: number };
type MoneyRow = { amount: number };

export type PlatformMerchantLifecycle = {
  application: PlatformApplication;
  commercial: PlatformCommercialSnapshot;
  delivery: {
    siteId: string | null;
    siteStatus: string | null;
    domain: string | null;
    domainStatus: string | null;
    publishedProducts: number;
    credentialProviders: number;
    isolatedCredentials: boolean;
    publishedVersions: number;
    latestReleaseAt: string | null;
  };
  operations: {
    readinessScore: number;
    readinessDone: number;
    readinessTotal: number;
    healthStatus: "healthy" | "attention" | "critical";
    openTickets: number;
    failedNotifications: number;
    failedPayments: number;
    unresolvedEvents: number;
    nextAction: string;
  };
};

export type PlatformOperationsSnapshot = {
  generatedAt: string;
  metrics: {
    applications: number;
    pendingReviews: number;
    merchants: number;
    liveSites: number;
    activeTrials: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    openTickets: number;
    failedPayments: number;
    monthlyRecurringRevenue: number;
    collectedRevenue: number;
    outstandingRevenue: number;
  };
  merchants: PlatformMerchantLifecycle[];
  revenueByMonth: Array<{ month: string; collected: number; invoices: number }>;
  applicationsByMonth: Array<{ month: string; applications: number; approved: number }>;
};

function number(value: unknown) { return Number(value || 0); }

async function count(database: ReturnType<typeof getCmsDatabase>, sql: string, ...bindings: unknown[]) {
  const row = await database.prepare(sql).bind(...bindings).first<CountRow>();
  return number(row?.count);
}

async function lifecycleFor(application: PlatformApplication): Promise<PlatformMerchantLifecycle> {
  const database = getCmsDatabase();
  const commercial = await getPlatformCommercialSnapshot(application.id);
  const siteId = application.assignedSiteId;
  let siteStatus: string | null = null;
  let domain: string | null = null;
  let domainStatus: string | null = null;
  let publishedProducts = 0;
  let credentialProviders = 0;
  let publishedVersions = 0;
  let latestReleaseAt: string | null = null;
  let unresolvedEvents = 0;
  let readyHealthChecks = 0;
  let totalHealthChecks = 0;
  if (siteId) {
    const site = await database.prepare("SELECT status, domain FROM cms_sites WHERE id = ?1").bind(siteId).first<{ status: string; domain: string | null }>();
    const domainRow = await database.prepare("SELECT hostname, status FROM cms_site_domains WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(siteId).first<{ hostname: string; status: string }>();
    const release = await database.prepare("SELECT created_at AS createdAt FROM cms_revisions WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(siteId).first<{ createdAt: string }>();
    const health = await database.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready FROM cms_health_checks WHERE site_id = ?1").bind(siteId).first<{ count: number; ready: number }>();
    siteStatus = site?.status || null;
    domain = domainRow?.hostname || site?.domain || null;
    domainStatus = domainRow?.status || null;
    publishedProducts = await count(database, "SELECT COUNT(*) AS count FROM cms_site_products WHERE site_id = ?1 AND published_payload IS NOT NULL", siteId);
    credentialProviders = await count(database, "SELECT COUNT(*) AS count FROM cms_site_integrations WHERE site_id = ?1 AND provider IN ('paypal','resend') AND status = 'ready'", siteId);
    publishedVersions = await count(database, "SELECT COUNT(*) AS count FROM cms_revisions WHERE site_id = ?1", siteId);
    latestReleaseAt = release?.createdAt || null;
    unresolvedEvents = await count(database, "SELECT COUNT(*) AS count FROM cms_operation_events WHERE site_id = ?1 AND status = 'failed' AND resolved_at IS NULL", siteId);
    totalHealthChecks = number(health?.count);
    readyHealthChecks = number(health?.ready);
  }
  const openTickets = await count(database, "SELECT COUNT(*) AS count FROM platform_support_tickets WHERE application_id = ?1 AND status <> 'resolved'", application.id);
  const failedNotifications = await count(database, "SELECT COUNT(*) AS count FROM platform_application_notifications WHERE application_id = ?1 AND status = 'failed'", application.id);
  const failedPayments = commercial.invoices.filter((invoice) => invoice.status === "failed").length;
  const subscriptionGood = Boolean(commercial.subscription && ["trialing", "active"].includes(commercial.subscription.status));
  const checks = [
    ["review", ["approved", "commercial_pending", "site_creating", "site_created", "live", "suspended"].includes(application.status)],
    ["commercial", subscriptionGood],
    ["site", Boolean(siteId)],
    ["owner", application.ownerInviteStatus === "accepted"],
    ["products", publishedProducts > 0],
    ["credentials", credentialProviders >= 2],
    ["domain", Boolean(domain && ["active", "verified"].includes(domainStatus || ""))],
    ["release", publishedVersions > 0],
  ] as const;
  const done = checks.filter(([, value]) => value).length;
  const score = Math.round(done / checks.length * 100);
  const critical = ["past_due", "expired", "cancelled"].includes(commercial.subscription?.status || "") || failedPayments > 0 || unresolvedEvents > 0;
  const nextAction = !checks[0][1] ? "审核商户申请" : !checks[1][1] ? "确认套餐或启动试用" : !checks[2][1] ? "从模板创建客户站点" : !checks[3][1] ? "邀请商户负责人激活账号" : !checks[4][1] ? "导入并发布商品" : !checks[5][1] ? "配置商户独立 PayPal 与邮件密钥" : !checks[6][1] ? "完成域名解析与验证" : !checks[7][1] ? "完成上线检查并发布首个版本" : critical ? "处理欠费、支付或运行异常" : openTickets ? "处理未完成工单" : "持续关注商户健康度";
  return {
    application,
    commercial,
    delivery: { siteId, siteStatus, domain, domainStatus, publishedProducts, credentialProviders, isolatedCredentials: Boolean(siteId && credentialProviders >= 2), publishedVersions, latestReleaseAt },
    operations: { readinessScore: score, readinessDone: done, readinessTotal: checks.length, healthStatus: critical ? "critical" : score >= 80 && readyHealthChecks === totalHealthChecks ? "healthy" : "attention", openTickets, failedNotifications, failedPayments, unresolvedEvents, nextAction },
  };
}

export async function getPlatformOperationsSnapshot(): Promise<PlatformOperationsSnapshot> {
  await ensurePlatformCommercialSchema();
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const applications = await listPlatformApplications();
  const merchants = await Promise.all(applications.map(lifecycleFor));
  const revenueRows = await database.prepare(`SELECT substr(paid_at, 1, 7) AS month, COALESCE(SUM(amount), 0) AS collected, COUNT(*) AS invoices
    FROM platform_billing_invoices WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY substr(paid_at, 1, 7) ORDER BY month DESC LIMIT 12`).all<{ month: string; collected: number; invoices: number }>();
  const applicationRows = await database.prepare(`SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS applications,
    SUM(CASE WHEN status IN ('approved','commercial_pending','site_creating','site_created','live','suspended') THEN 1 ELSE 0 END) AS approved
    FROM platform_applications GROUP BY substr(created_at, 1, 7) ORDER BY month DESC LIMIT 12`).all<{ month: string; applications: number; approved: number }>();
  const collected = await database.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM platform_billing_invoices WHERE status = 'paid'").first<MoneyRow>();
  const outstanding = await database.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM platform_billing_invoices WHERE status IN ('open','failed')").first<MoneyRow>();
  const activeSubscriptions = merchants.filter((item) => item.commercial.subscription?.status === "active");
  const monthlyRecurringRevenue = activeSubscriptions.reduce((sum, item) => sum + (item.commercial.subscription?.billingInterval === "annual" ? number(item.commercial.subscription.recurringFee) / 12 : number(item.commercial.subscription?.recurringFee)), 0);
  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      applications: applications.length,
      pendingReviews: applications.filter((item) => ["submitted", "reviewing", "needs_info"].includes(item.status)).length,
      merchants: applications.filter((item) => Boolean(item.assignedSiteId)).length,
      liveSites: applications.filter((item) => item.status === "live").length,
      activeTrials: merchants.filter((item) => item.commercial.subscription?.status === "trialing").length,
      activeSubscriptions: activeSubscriptions.length,
      pastDueSubscriptions: merchants.filter((item) => ["past_due", "expired"].includes(item.commercial.subscription?.status || "")).length,
      openTickets: merchants.reduce((sum, item) => sum + item.operations.openTickets, 0),
      failedPayments: merchants.reduce((sum, item) => sum + item.operations.failedPayments, 0),
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100,
      collectedRevenue: number(collected?.amount),
      outstandingRevenue: number(outstanding?.amount),
    },
    merchants,
    revenueByMonth: revenueRows.results.map((row) => ({ month: row.month, collected: number(row.collected), invoices: number(row.invoices) })),
    applicationsByMonth: applicationRows.results.map((row) => ({ month: row.month, applications: number(row.applications), approved: number(row.approved) })),
  };
}
