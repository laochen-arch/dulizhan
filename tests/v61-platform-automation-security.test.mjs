import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("V61 separates platform PayPal subscriptions from storefront checkout", async () => {
  const billing = await source("../db/v61.ts");
  const environment = await source("../.env.example");
  const route = await source("../app/api/platform/billing/paypal/subscriptions/route.ts");
  assert.match(environment, /PLATFORM_PAYPAL_CLIENT_ID/);
  assert.match(environment, /PLATFORM_PAYPAL_PLAN_STARTER_MONTHLY/);
  assert.match(billing, /\/v1\/billing\/subscriptions/);
  assert.match(billing, /PayPal-Request-Id/);
  assert.match(route, /resolvePlatformApplicationAccess/);
  assert.doesNotMatch(route, /PAYPAL_CLIENT_SECRET/);
});

test("V61 webhook processing is signed, idempotent, ordered and amount checked", async () => {
  const billing = await source("../db/v61.ts");
  const route = await source("../app/api/platform/billing/paypal/webhook/route.ts");
  const migration = await source("../drizzle/0024_v61_platform_automation_security.sql");
  assert.match(route, /verifyPlatformPayPalWebhook/);
  assert.match(billing, /verify-webhook-signature/);
  assert.match(migration, /provider_event_id TEXT NOT NULL UNIQUE/);
  assert.match(billing, /stale_event/);
  assert.match(billing, /PLATFORM_PAYMENT_AMOUNT_MISMATCH/);
  assert.match(billing, /dead_letter/);
});

test("V61 delivery is an idempotent retryable state machine", async () => {
  const delivery = await source("../db/v61.ts");
  const worker = await source("../worker/index.ts");
  assert.match(delivery, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(delivery, /delivery:\$\{applicationId\}/);
  assert.match(delivery, /status = 'processing'/);
  assert.match(delivery, /manual_review/);
  assert.match(worker, /runV61PlatformAutomation/);
  assert.match(worker, /retryFailedPlatformApplicationNotifications/);
});

test("V61 records high-risk actions and rate limits mutation endpoints", async () => {
  const security = await source("../db/v61.ts");
  const applications = await source("../app/api/platform/applications/route.ts");
  const operations = await source("../app/api/platform/operations/route.ts");
  assert.match(security, /platform_security_events/);
  assert.match(security, /platform_rate_limits/);
  assert.match(applications, /enforcePlatformRateLimit/);
  assert.match(applications, /riskLevel: "high"/);
  assert.match(operations, /run_automation/);
});
