import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: siteWorker } = await import(workerUrl.href);
  return siteWorker;
}

async function render(pathname = "/") {
  const siteWorker = await worker();
  return siteWorker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Northline storefront shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Northline Supply/);
  assert.match(html, /Pack lighter/);
  assert.match(html, /Shop all/);
  assert.match(html, /Considered gear/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders the core white-label storefront routes", async () => {
  for (const pathname of ["/shop", "/products/field-pack-28l", "/cart", "/checkout", "/about", "/faq", "/shipping", "/admin", "/preview"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
  }
});

test("keeps the storefront conversion and delivery controls rendered", async () => {
  const shop = await render("/shop");
  const shopHtml = await shop.text();
  assert.match(shopHtml, /href="\/products\/field-pack-28l"/);
  assert.match(shopHtml, /href="\/cart"/);

  const admin = await render("/admin");
  const adminHtml = await admin.text();
  assert.match(adminHtml, /Launch setup/);
  assert.match(adminHtml, /Client delivery/);
  const launchPanels = await readFile(new URL("../app/admin/launch-panels.tsx", import.meta.url), "utf8");
  assert.match(launchPanels, /Production launch setup/);
  assert.match(launchPanels, /Client delivery center/);
  assert.match(launchPanels, /PayPal/);
  assert.doesNotMatch(launchPanels, /Stripe/);
  const checkoutForm = await readFile(new URL("../app/components/checkout-form.tsx", import.meta.url), "utf8");
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  assert.match(checkoutForm, /PayPal secure checkout/);
  assert.match(commerce, /createPayPalOrder/);
  assert.match(commerce, /processPayPalEvent/);
  assert.match(commerce, /checkout_idempotency_key/);
  assert.match(commerce, /completeRefundRecord/);
  assert.match(commerce, /releaseExpiredOrderReservations/);
  assert.doesNotMatch(commerce, /STRIPE_/);
  const checkoutFormSource = await readFile(new URL("../app/components/checkout-form.tsx", import.meta.url), "utf8");
  assert.match(checkoutFormSource, /x-idempotency-key/);
  const expireRoute = await readFile(new URL("../app/api/cms/commerce/expire/route.ts", import.meta.url), "utf8");
  assert.match(expireRoute, /releaseExpiredOrderReservations/);
  const sitesRoute = await readFile(new URL("../app/api/cms/sites/route.ts", import.meta.url), "utf8");
  assert.match(sitesRoute, /createSitesFromTemplateBatch/);
});

test("keeps client replacement content centralized", async () => {
  const config = await readFile(new URL("../app/data/site-config.ts", import.meta.url), "utf8");
  const products = await readFile(new URL("../app/data/products.ts", import.meta.url), "utf8");
  const guide = await readFile(new URL("../outputs/独立站母版-B端客户替换内容清单.md", import.meta.url), "utf8");

  assert.match(config, /theme:/);
  assert.match(config, /b2b:/);
  assert.match(config, /navigation:/);
  assert.match(config, /seo:/);
  assert.match(config, /policies:/);
  assert.match(products, /export const products/);
  assert.match(products, /Field Pack 28L/);
  assert.match(products, /ProductVariant/);
  assert.match(products, /status: "active"/);
  assert.match(products, /stock:/);
  assert.match(products, /relatedSlugs:/);
  assert.match(products, /variants:/);
  assert.match(guide, /B 端客户首次提供资料后/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("keeps V20 tenant boundaries and release gates in source", async () => {
  const cms = await readFile(new URL("../db/cms.ts", import.meta.url), "utf8");
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  const cart = await readFile(new URL("../app/components/cart-store.ts", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../app/api/cms/onboarding/route.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const money = await readFile(new URL("../app/lib/format-money.ts", import.meta.url), "utf8");

  assert.match(cms, /cms_launch_checks/);
  assert.match(cms, /publish\.blocked/);
  assert.match(cms, /PAYPAL_CLIENT_ID/);
  assert.match(cms, /manualChecks/);
  assert.match(commerce, /SET_FROM_PROVIDER/);
  assert.match(commerce, /getStoreCommerceProfile/);
  assert.doesNotMatch(commerce, /brand_name: "Northline Supply"/);
  assert.match(cart, /northline-cart-v20/);
  assert.match(cart, /encodeURIComponent\(scope\)/);
  assert.match(onboarding, /updateLaunchCheck/);
  assert.match(layout, /generateMetadata/);
  assert.match(money, /Intl\.NumberFormat/);
});

test("keeps V21 operations and customer recovery paths in source", async () => {
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  const v21 = await readFile(new URL("../db/v21.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../drizzle/0008_v21_operations.sql", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/v21-panels.tsx", import.meta.url), "utf8");
  assert.match(commerce, /dead_lettered/);
  assert.match(commerce, /reconcilePayPalOrders/);
  assert.match(commerce, /cms_order_access_tokens/);
  assert.match(commerce, /idempotency_key/);
  assert.match(v21, /cms_after_sales_requests/);
  assert.match(v21, /cms_client_intake/);
  assert.match(v21, /cms_analytics_events/);
  assert.match(v21, /cms_bundles/);
  assert.match(schema, /cms_health_checks/);
  assert.match(admin, /Launch health/);
  assert.match(admin, /After-sales queue/);
  assert.match(admin, /Bundle merchandising/);
});
