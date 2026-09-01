import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("refunds use local and PayPal idempotency keys", async () => {
  const commerce = await source("db/commerce.ts");
  const route = await source("app/api/cms/orders/refund/route.ts");
  assert.match(commerce, /cms_refunds_idempotency_unique|idempotency_key/);
  assert.match(commerce, /"PayPal-Request-Id": input\.idempotencyKey/);
  assert.match(commerce, /UPDATE cms_refunds SET status = 'pending', error = \?1 WHERE id = \?2 AND paypal_refund_id IS NULL/);
  assert.match(commerce, /refund_reserved_minor = refund_reserved_minor \+ \?1/);
  assert.match(route, /x-idempotency-key/);
});

test("late captures are paid exceptions instead of false payment failures", async () => {
  const commerce = await source("db/commerce.ts");
  assert.match(commerce, /paid_inventory_exception/);
  assert.match(commerce, /payment_status IN \('pending', 'cancelled', 'failed'\)/);
  assert.match(commerce, /Captured amount or currency does not match/);
  const finalize = commerce.slice(commerce.indexOf("async function finalizePaidOrder"), commerce.indexOf("export async function verifyPayPalWebhook"));
  assert.equal(finalize.includes("UPDATE cms_orders SET status = 'payment_failed', payment_status = 'failed', updated_at"), false);
});

test("coupon claims, money columns and recovery locks are durable", async () => {
  const commerce = await source("db/commerce.ts");
  const worker = await source("worker/index.ts");
  const migration = await source("drizzle/0021_production_hardening.sql");
  assert.match(commerce, /UPDATE cms_coupons SET uses = uses \+ 1/);
  assert.match(commerce, /coupon_released_at IS NULL/);
  assert.match(migration, /total_minor/);
  assert.match(worker, /cms_maintenance_runs/);
  assert.match(worker, /Content-Security-Policy/);
});

test("marketing consent has a real unsubscribe path", async () => {
  const newsletter = await source("db/v28.ts");
  const route = await source("app/api/newsletter/route.ts");
  const page = await source("app/unsubscribe/page.tsx");
  assert.match(newsletter, /unsubscribe_token_hash/);
  assert.match(newsletter, /export async function unsubscribeFromNewsletter/);
  assert.match(route, /export async function DELETE/);
  assert.match(page, /Unsubscribe/);
});

test("merchant support is a least-privilege role", async () => {
  const roles = await source("db/v25.ts");
  const support = roles.match(/merchant_support:\s*\[([\s\S]*?)\n\s*\],/);
  assert.ok(support);
  assert.match(support[1], /orders\.read/);
  assert.match(support[1], /after-sales\.write/);
  assert.doesNotMatch(support[1], /products\.write|orders\.refund|fulfillment\.write/);
});

test("platform owner, operator and support permissions stay separated", async () => {
  const roles = await source("db/platform-access.ts");
  const access = await source("app/api/platform/application-access.ts");
  const supportRoute = await source("app/api/platform/applications/support/route.ts");
  const support = roles.match(/platform_support:\s*\[([^\]]*)\]/);
  assert.ok(support);
  assert.match(support[1], /applications\.read/);
  assert.match(support[1], /support\.manage/);
  assert.doesNotMatch(support[1], /applications\.review|sites\.create|billing\.manage/);
  assert.match(access, /canSupport: staff\.canSupport/);
  assert.match(supportRoute, /access\?\.canSupport/);
});
