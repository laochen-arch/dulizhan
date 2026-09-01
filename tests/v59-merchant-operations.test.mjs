import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("V59 P1 customer center is tenant scoped and capability protected", async () => {
  const route = await source("app/api/merchant/customers/route.ts");
  const db = await source("db/v59-merchant.ts");
  const roles = await source("db/v25.ts");
  assert.match(route, /requireMerchantCapability\(request, "customers\.read"/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(db, /FROM cms_orders WHERE site_id = \?1 GROUP BY lower\(email\)/);
  assert.match(db, /FROM customer_addresses WHERE site_id = \?1 AND user_id = \?2/);
  assert.match(roles, /customers\.read/);
});

test("V59 P1 operations exposes actionable real-data tasks", async () => {
  const route = await source("app/api/merchant/operations/route.ts");
  const db = await source("db/v59-merchant.ts");
  const ui = await source("app/client/client-portal.tsx");
  assert.match(route, /getMerchantOperationalTasks/);
  assert.match(db, /cms_order_notifications/);
  assert.match(db, /cms_payment_events/);
  assert.match(db, /cms_after_sales_requests/);
  assert.match(db, /quantity - reserved_quantity <= 5/);
  assert.match(ui, /今日待办/);
  assert.match(ui, /selectSection\(item\.section\)/);
});

test("V59 P1 order cancellation and refund restock rules are explicit", async () => {
  const commerce = await source("db/commerce.ts");
  const orders = await source("app/api/merchant/orders/route.ts");
  const refunds = await source("app/api/merchant/refunds/route.ts");
  const ui = await source("app/merchant/service-panels.tsx");
  assert.match(commerce, /cancelPendingOrder/);
  assert.match(commerce, /ORDER_CANCEL_REQUIRES_REFUND/);
  assert.match(commerce, /releasedInventory: true, releasedCoupon: true/);
  assert.match(orders, /payload\.action === "cancel"/);
  assert.match(refunds, /payload\.restockItems\|\|\[\]/);
  assert.match(ui, /退款成功后回补库存/);
});

test("V59 P1 storefront editing owns navigation, homepage, policies and SEO", async () => {
  const db = await source("db/v23.ts");
  const route = await source("app/api/merchant/brand/route.ts");
  const ui = await source("app/client/client-portal.tsx");
  assert.match(db, /config\.navigation = navigation/);
  assert.match(db, /config\.content\.policies/);
  assert.match(db, /config\.seo/);
  assert.match(route, /navigation:payload\.navigation/);
  assert.match(ui, /顶部导航（每行/);
  assert.match(ui, /搜索展示（SEO）/);
});
