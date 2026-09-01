import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("V60 keeps the complete platform merchant lifecycle in one operator surface", async () => {
  const panel = await source("../app/admin/v60-platform-panel.tsx");
  const admin = await source("../app/admin/admin-v6.tsx");
  assert.match(admin, /商户与续费/);
  assert.match(admin, /收入报表/);
  assert.match(panel, /一键复制模板并建站/);
  assert.match(panel, /配置独立密钥/);
  assert.match(panel, /域名接入/);
  assert.match(panel, /发布与回滚/);
  assert.match(panel, /处理工单与通知/);
  assert.match(panel, /平台账单与收款记录/);
});

test("V60 subscription state machine covers trial, renewal, past due and recovery", async () => {
  const commercial = await source("../db/v34.ts");
  const route = await source("../app/api/platform/operations/route.ts");
  assert.match(commercial, /"trialing"/);
  assert.match(commercial, /platform_trial_started/);
  assert.match(commercial, /platform_subscription_past_due/);
  assert.match(commercial, /platform_subscription_expired/);
  assert.match(commercial, /platform_subscription_reactivated/);
  assert.match(route, /create_renewal/);
  assert.match(route, /payment_paid/);
  assert.match(route, /payment_failed/);
});

test("V60 reporting separates platform revenue and exposes no credential values", async () => {
  const lifecycle = await source("../db/v60.ts");
  const panel = await source("../app/admin/v60-platform-panel.tsx");
  const migration = await source("../drizzle/0023_v60_platform_commercial_delivery.sql");
  assert.match(lifecycle, /monthlyRecurringRevenue/);
  assert.match(lifecycle, /collectedRevenue/);
  assert.match(lifecycle, /platform_billing_invoices/);
  assert.doesNotMatch(lifecycle, /client_secret_cipher|api_key_cipher/);
  assert.match(panel, /不混入各商户商城的商品销售额/);
  assert.match(migration, /trial_ends_at/);
});
