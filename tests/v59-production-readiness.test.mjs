import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("V59 blocks formal publishing without Live providers, domain, fresh health and backup evidence", async () => {
  const cms = await source("db/cms.ts");
  assert.match(cms, /key: "paypal-live"/);
  assert.match(cms, /readiness\.paypalLive/);
  assert.match(cms, /key: "resend-domain"/);
  assert.match(cms, /resendProductionSender/);
  assert.match(cms, /key: "runtime-health"/);
  assert.match(cms, /key: "verified-backup"/);
  assert.match(cms, /required: true/);
  assert.match(cms, /PUBLISH_CHECKS/);
});

test("V59 backup is private, tenant scoped, excludes provider secrets and supports a restore drill", async () => {
  const backup = await source("db/production.ts");
  assert.match(backup, /backups\/\$\{safeSiteKey\(siteId\)\}/);
  assert.match(backup, /cacheControl: "private, no-store"/);
  assert.doesNotMatch(backup, /cms_site_integrations/);
  assert.match(backup, /BACKUP_VALIDATION_FAILED/);
  assert.match(backup, /restoreDrill: \{ dryRun: true, recoverable: true/);
  assert.match(backup, /RETAIN_BACKUPS = 14/);
  const route = await source("app/api/cms/backups/route.ts");
  assert.match(route, /requireMember\(siteId, "owner"\)/);
  const merchantRoute = await source("app/api/merchant/backups/route.ts");
  const merchantRoles = await source("db/v25.ts");
  assert.match(merchantRoute, /requireMerchantCapability\(request, "merchant\.data\.export"/);
  assert.match(merchantRoles, /merchant\.data\.export/);
});

test("V59 automatic recovery creates daily backups and health probes real storage", async () => {
  const worker = await source("worker/index.ts");
  const health = await source("db/v21.ts");
  assert.match(worker, /ensureDailyTenantBackup/);
  assert.match(worker, /X-Request-ID/);
  assert.match(health, /R2 write, read and delete probe succeeded/);
  assert.match(health, /cms_maintenance_runs/);
});

test("V59 canonical metadata follows the configured tenant domain", async () => {
  const layout = await source("app/layout.tsx");
  const product = await source("app/products/[slug]/page.tsx");
  assert.match(layout, /site\.domain \|\| requestHost/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(product, /site\.domain \|\| host/);
  assert.match(product, /alternates: \{ canonical \}/);
});

test("V59 ships an additive backup migration and a production acceptance runbook", async () => {
  const migration = await source("drizzle/0022_v59_production_launch.sql");
  const runbook = await source("docs/V59_PRODUCTION_LAUNCH_RUNBOOK.md");
  const acceptance = await source("docs/V59_PRODUCTION_ACCEPTANCE.md");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `cms_tenant_backups`/);
  assert.match(runbook, /PayPal Live/);
  assert.match(runbook, /上线阻断项/);
  assert.match(acceptance, /申请.*审核.*上架商品|支付|Webhook/);
});
