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
  assert.match(adminHtml, /Platform setup/);
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
  const integrations = await readFile(new URL("../db/site-integrations.ts", import.meta.url), "utf8");
  const cart = await readFile(new URL("../app/components/cart-store.ts", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../app/api/cms/onboarding/route.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const money = await readFile(new URL("../app/lib/format-money.ts", import.meta.url), "utf8");

  assert.match(cms, /cms_launch_checks/);
  assert.match(cms, /publish\.blocked/);
  assert.match(integrations, /PAYPAL_CLIENT_ID/);
  assert.match(cms, /manualChecks/);
  assert.match(commerce, /SET_PROVIDED_ADDRESS/);
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

test("keeps V22 production control and durable delivery wizard in source", async () => {
  const v22 = await readFile(new URL("../db/v22.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../drizzle/0009_v22_delivery_operations.sql", import.meta.url), "utf8");
  const wizard = await readFile(new URL("../app/admin/v22-panels.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/admin-v6.tsx", import.meta.url), "utf8");
  const deliveryRoute = await readFile(new URL("../app/api/cms/delivery/route.ts", import.meta.url), "utf8");
  const operationsRoute = await readFile(new URL("../app/api/cms/operations/route.ts", import.meta.url), "utf8");

  assert.match(v22, /cms_delivery_runs/);
  assert.match(v22, /cms_operation_events/);
  assert.match(v22, /getProductionReadiness/);
  assert.match(schema, /cms_delivery_runs/);
  assert.match(schema, /cms_operation_events/);
  assert.match(wizard, /Client delivery wizard/);
  assert.match(wizard, /Download package template/);
  assert.match(wizard, /Run all checks/);
  assert.match(admin, /Delivery controls/);
  assert.match(deliveryRoute, /updateDeliveryRun/);
  assert.match(operationsRoute, /resolveOperationEvent/);
});

test("keeps V23 tenant secrets and client self-service boundaries in source", async () => {
  const integrations = await readFile(new URL("../db/site-integrations.ts", import.meta.url), "utf8");
  const portal = await readFile(new URL("../db/v23.ts", import.meta.url), "utf8");
  const configRoute = await readFile(new URL("../app/api/cms/integrations/route.ts", import.meta.url), "utf8");
  const clientRoute = await readFile(new URL("../app/api/client/overview/route.ts", import.meta.url), "utf8");
  const clientPage = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  assert.match(integrations, /AES-GCM/);
  assert.match(integrations, /CMS_SECRETS_KEY/);
  assert.match(integrations, /siteId/);
  assert.match(portal, /client\.brand_updated/);
  assert.match(portal, /client\.product_updated/);
  assert.match(configRoute, /requireMember\(siteId, "owner"\)/);
  assert.match(clientRoute, /requireMember\(siteId, "viewer"\)/);
  assert.match(clientPage, /保存加密配置/);
});

test("keeps V24 release approval and client operations in source", async () => {
  const v24 = await readFile(new URL("../db/v24.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../drizzle/0011_v24_release_operations.sql", import.meta.url), "utf8");
  const releases = await readFile(new URL("../app/api/cms/releases/route.ts", import.meta.url), "utf8");
  const previewShare = await readFile(new URL("../app/api/cms/preview-share/route.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../app/api/client/catalog/route.ts", import.meta.url), "utf8");
  const portal = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/v24-panels.tsx", import.meta.url), "utf8");

  assert.match(v24, /release\.requested/);
  assert.match(v24, /rollbackPublishedRevision/);
  assert.match(v24, /cms_preview_tokens/);
  assert.match(v24, /getClientOrderDetail/);
  assert.match(schema, /cms_release_requests/);
  assert.match(schema, /cms_preview_tokens/);
  assert.match(releases, /reviewReleaseRequest/);
  assert.match(previewShare, /createPreviewShare/);
  assert.match(catalog, /previewClientImport/);
  assert.match(portal, /MerchantCatalog/);
  assert.match(portal, /MerchantAfterSales/);
  const catalogUi = await readFile(new URL("../app/merchant/catalog-panel.tsx", import.meta.url), "utf8");
  const serviceUi = await readFile(new URL("../app/merchant/service-panels.tsx", import.meta.url), "utf8");
  assert.match(catalogUi, /variantOptionValues/);
  assert.match(serviceUi, /登记售后申请/);
  assert.match(admin, /V24 \/ Production launch center/);
});

test("keeps V25 identity-aware storefront access and account boundaries", async () => {
  const v25 = await readFile(new URL("../db/v25.ts", import.meta.url), "utf8");
  const cms = await readFile(new URL("../db/cms.ts", import.meta.url), "utf8");
  const sessionRoute = await readFile(new URL("../app/api/account/session/route.ts", import.meta.url), "utf8");
  const manageHelpers = await readFile(new URL("../app/api/manage/helpers.ts", import.meta.url), "utf8");
  const header = await readFile(new URL("../app/components/site-header.tsx", import.meta.url), "utf8");
  const account = await readFile(new URL("../app/account/account-page.tsx", import.meta.url), "utf8");
  const accountResponse = await render("/account");

  assert.equal(accountResponse.status, 200);
  assert.match(v25, /merchant_members/);
  assert.match(v25, /store_customers/);
  assert.match(v25, /customer_addresses/);
  assert.match(v25, /merchant_owner/);
  assert.match(cms, /findMember/);
  assert.match(sessionRoute, /getStorefrontAccess/);
  assert.match(manageHelpers, /requireMerchantMember/);
  assert.match(header, /StorefrontAccessMenu/);
  assert.match(header, /SiteHeader/);
  assert.match(account, /Saved addresses/);
  assert.match(account, /Sign in to continue/);
});

test("keeps V26 storefront conversion and account continuity paths in source", async () => {
  const v26 = await readFile(new URL("../db/v26.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const wishlistRoute = await readFile(new URL("../app/api/account/wishlist/route.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/checkout/quote/route.ts", import.meta.url), "utf8");
  const quoteForm = await readFile(new URL("../app/components/checkout-form.tsx", import.meta.url), "utf8");
  const drawer = await readFile(new URL("../app/components/cart-drawer.tsx", import.meta.url), "utf8");
  const recent = await readFile(new URL("../app/components/recently-viewed.tsx", import.meta.url), "utf8");
  const shop = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  assert.match(v26, /store_wishlists/);
  assert.match(schema, /storeWishlists/);
  assert.match(wishlistRoute, /getAccountContext/);
  assert.match(quoteRoute, /getCheckoutQuote/);
  assert.match(quoteForm, /\/api\/checkout\/quote/);
  assert.match(quoteForm, /\/api\/account\/addresses/);
  assert.match(drawer, /role="dialog"/);
  assert.match(recent, /Recently/);
  assert.match(shop, /mobile-filter-toggle/);
});

test("keeps V27 storefront discovery and repeat-purchase paths in source", async () => {
  const account = await readFile(new URL("../app/account/account-page.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../app/components/product-card.tsx", import.meta.url), "utf8");
  const share = await readFile(new URL("../app/components/product-share.tsx", import.meta.url), "utf8");
  const cart = await readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
  const shop = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/products/[slug]/product-detail-view.tsx", import.meta.url), "utf8");

  assert.match(account, /Saved gear/);
  assert.match(account, /useWishlist/);
  assert.match(card, /requiresOptions/);
  assert.match(card, /Choose options/);
  assert.match(share, /navigator\.share/);
  assert.match(cart, /cart-shipping-progress/);
  assert.match(cart, /hasStaleStock/);
  assert.match(shop, /shop-active-filters/);
  assert.match(detail, /ProductShare/);
});

test("keeps V28 recovery, retention and storefront trust paths in source", async () => {
  const v28 = await readFile(new URL("../db/v28.ts", import.meta.url), "utf8");
  const compatibilityMigration = await readFile(new URL("../drizzle/0012_volatile_loners.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../drizzle/0013_curved_odin.sql", import.meta.url), "utf8");
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  const checkout = await readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8");
  const orders = await readFile(new URL("../app/orders/page.tsx", import.meta.url), "utf8");
  const cart = await readFile(new URL("../app/components/cart-coupon.tsx", import.meta.url), "utf8");
  const account = await readFile(new URL("../app/components/reorder-button.tsx", import.meta.url), "utf8");
  const consent = await readFile(new URL("../app/components/consent-banner.tsx", import.meta.url), "utf8");
  assert.match(v28, /store_newsletter_subscribers/);
  assert.match(v28, /store_stock_alerts/);
  assert.match(v28, /sendResendMessage/);
  assert.match(schema, /store_newsletter_subscribers/);
  assert.match(schema, /store_stock_alerts/);
  assert.match(compatibilityMigration, /safe no-op/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS/);
  assert.match(commerce, /retryPayPalCheckout/);
  assert.match(commerce, /accessToken/);
  assert.match(checkout, /Try PayPal again/);
  assert.match(checkout, /\/orders\?token=/);
  assert.match(orders, /after-sales-status/);
  assert.match(orders, /trackingUrl/);
  assert.match(cart, /\/api\/checkout\/quote/);
  assert.match(account, /Buy again/);
  assert.match(consent, /northline-consent-v28/);
  assert.equal((await render("/privacy")).status, 200);
  assert.equal((await render("/terms")).status, 200);
  assert.equal((await render("/accessibility")).status, 200);
});

test("keeps V29 P0 storefront navigation, purchase and payment recovery paths", async () => {
  const header = await readFile(new URL("../app/components/site-header.tsx", import.meta.url), "utf8");
  const access = await readFile(new URL("../app/components/storefront-access-menu.tsx", import.meta.url), "utf8");
  const gallery = await readFile(new URL("../app/components/product-gallery.tsx", import.meta.url), "utf8");
  const purchase = await readFile(new URL("../app/components/product-actions.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/products/[slug]/product-detail-view.tsx", import.meta.url), "utf8");
  const checkout = await readFile(new URL("../app/components/checkout-form.tsx", import.meta.url), "utf8");
  const checkoutPage = await readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8");
  const orders = await readFile(new URL("../app/orders/page.tsx", import.meta.url), "utf8");
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  const shop = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  const session = await readFile(new URL("../app/lib/storefront-session.ts", import.meta.url), "utf8");

  assert.match(header, /Category navigation belongs to the collection filter rail/);
  assert.match(access, /signout-with-chatgpt/);
  assert.match(access, /capabilities/);
  assert.match(session, /sessionRequest/);
  assert.match(gallery, /gallery-zoom-layer/);
  assert.match(purchase, /product-purchase/);
  assert.match(purchase, /product-delivery-note/);
  assert.match(detail, /mobile-purchase-bar/);
  assert.match(checkout, /checkout-steps/);
  assert.match(checkoutPage, /Refresh payment status/);
  assert.match(orders, /shippingSummary/);
  assert.match(commerce, /shippingSummary/);
  assert.match(shop, /Load more products/);
});

test("keeps V30 identity binding and canonical commerce recovery paths", async () => {
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");
  const v25 = await readFile(new URL("../db/v25.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const cms = await readFile(new URL("../db/cms.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0014_v30_customer_binding.sql", import.meta.url), "utf8");
  const checkout = await readFile(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
  const accountOrders = await readFile(new URL("../app/api/account/orders/route.ts", import.meta.url), "utf8");
  const recovery = await readFile(new URL("../app/api/cms/commerce/ops/route.ts", import.meta.url), "utf8");
  const refunds = await readFile(new URL("../app/api/cms/commerce/refunds/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/admin-v6.tsx", import.meta.url), "utf8");
  const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

  assert.match(schema, /customerUserId: text\("customer_user_id"\)/);
  assert.match(cms, /ensureColumn\(database, "cms_orders", "customer_user_id"/);
  assert.match(cms, /cms_orders_site_customer_idx/);
  assert.match(migration, /customer_user_id/);
  assert.match(checkout, /getChatGPTUser/);
  assert.match(checkout, /user\?\.userId/);
  assert.match(accountOrders, /user\.userId/);
  assert.match(v25, /claimGuestOrders/);
  assert.match(v25, /customer_user_id = \?2/);
  assert.match(commerce, /PAYMENT_CAPTURE_NOT_CONFIRMED/);
  assert.match(commerce, /CHECKOUT\.ORDER\.COMPLETED.*Boolean\(reference\.captureId\)/);
  assert.match(commerce, /type === "refunded"/);
  assert.match(commerce, /reconcilePayPalRefunds/);
  assert.match(commerce, /runCommerceRecovery/);
  assert.match(recovery, /runCommerceRecovery/);
  assert.match(refunds, /reconcilePayPalRefunds/);
  assert.match(workerSource, /runCommerceRecovery/);
  assert.match(admin, /const selectTab/);
  assert.match(admin, /status=\{/);
  assert.match(admin, /cmsRole === "viewer"/);
});

test("keeps V31 P0 storefront checkout, account cart and mobile continuity paths", async () => {
  const cart = await readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
  const validation = await readFile(new URL("../app/components/cart-validation.tsx", import.meta.url), "utf8");
  const drawer = await readFile(new URL("../app/components/cart-drawer.tsx", import.meta.url), "utf8");
  const accountCart = await readFile(new URL("../app/api/account/cart/route.ts", import.meta.url), "utf8");
  const v31 = await readFile(new URL("../db/v31.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../app/components/cart-account-sync.tsx", import.meta.url), "utf8");
  const mobileNav = await readFile(new URL("../app/components/storefront-mobile-nav.tsx", import.meta.url), "utf8");
  const checkout = await readFile(new URL("../app/components/checkout-form.tsx", import.meta.url), "utf8");
  const productActions = await readFile(new URL("../app/components/product-actions.tsx", import.meta.url), "utf8");
  const productMetadata = await readFile(new URL("../app/products/[slug]/page.tsx", import.meta.url), "utf8");
  const session = await readFile(new URL("../app/lib/storefront-session.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0015_v31_storefront_cart.sql", import.meta.url), "utf8");

  assert.match(cart, /useCartValidation/);
  assert.match(cart, /Continue to checkout/);
  assert.match(validation, /\/api\/checkout\/quote/);
  assert.match(validation, /Checking live availability and price/);
  assert.match(drawer, /Review bag before checkout/);
  assert.match(accountCart, /mergeCustomerCart/);
  assert.match(accountCart, /replaceCustomerCart/);
  assert.match(v31, /store_carts/);
  assert.match(schema, /storeCarts/);
  assert.match(sync, /\/api\/account\/cart/);
  assert.match(sync, /mergeCustomerCart|method: "POST"/);
  assert.match(mobileNav, /Mobile storefront navigation/);
  assert.match(checkout, /Saved address/);
  assert.match(checkout, /autoComplete="street-address"/);
  assert.match(productActions, /compatible/);
  assert.match(productMetadata, /metadataBase/);
  assert.match(session, /sessionRequest/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS store_carts/);
  assert.equal((await render("/products/field-pack-28l")).status, 200);
  assert.equal((await render("/cart")).status, 200);
  assert.equal((await render("/checkout")).status, 200);
});

test("keeps V31 P1 storefront discovery, retention and post-purchase paths", async () => {
  const shop = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  const header = await readFile(new URL("../app/components/site-header.tsx", import.meta.url), "utf8");
  const cartStore = await readFile(new URL("../app/components/cart-store.ts", import.meta.url), "utf8");
  const saved = await readFile(new URL("../app/components/saved-for-later.tsx", import.meta.url), "utf8");
  const cart = await readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
  const recommendations = await readFile(new URL("../app/components/cart-recommendations.tsx", import.meta.url), "utf8");
  const orders = await readFile(new URL("../app/orders/page.tsx", import.meta.url), "utf8");
  const accountOrder = await readFile(new URL("../app/account/orders/[orderId]/page.tsx", import.meta.url), "utf8");
  const reviews = await readFile(new URL("../app/components/reviews.tsx", import.meta.url), "utf8");
  const trust = await readFile(new URL("../app/components/storefront-trust-bar.tsx", import.meta.url), "utf8");
  const orderStatus = await readFile(new URL("../app/lib/order-status.ts", import.meta.url), "utf8");
  const commerce = await readFile(new URL("../db/commerce.ts", import.meta.url), "utf8");

  assert.match(shop, /popstate/);
  assert.match(shop, /shop-empty-suggestions/);
  assert.match(shop, /search_submitted/);
  assert.match(header, /No matching gear yet/);
  assert.match(header, /search_suggestion_clicked/);
  assert.match(cartStore, /savedStorageKey/);
  assert.match(cartStore, /saveForLater/);
  assert.match(cartStore, /moveToCart/);
  assert.match(saved, /Saved for later/);
  assert.match(cart, /CartRecommendations/);
  assert.match(recommendations, /Complete the kit/);
  assert.match(orders, /after_sales_submitted/);
  assert.match(orders, /Review product/);
  assert.match(accountOrder, /Review this product/);
  assert.match(reviews, /id="reviews"/);
  assert.match(reviews, /review_submitted/);
  assert.match(trust, /Secure PayPal checkout/);
  assert.match(orderStatus, /canReviewOrder/);
  assert.match(commerce, /productId: item\.productId/);
  assert.equal((await render("/shop")).status, 200);
  assert.equal((await render("/orders")).status, 200);
});

test("keeps V32 platform onboarding and merchant operations boundaries", async () => {
  const platform = await readFile(new URL("../app/platform/page.tsx", import.meta.url), "utf8");
  const applicationForm = await readFile(new URL("../app/platform/platform-application-form.tsx", import.meta.url), "utf8");
  const applicationsRoute = await readFile(new URL("../app/api/platform/applications/route.ts", import.meta.url), "utf8");
  const merchantProducts = await readFile(new URL("../app/api/merchant/products/route.ts", import.meta.url), "utf8");
  const merchantCampaigns = await readFile(new URL("../app/api/merchant/campaigns/route.ts", import.meta.url), "utf8");
  const merchantOperations = await readFile(new URL("../app/api/merchant/operations/route.ts", import.meta.url), "utf8");
  const v32 = await readFile(new URL("../db/v32.ts", import.meta.url), "utf8");
  const v61 = await readFile(new URL("../db/v61.ts", import.meta.url), "utf8");
  const cms = await readFile(new URL("../db/cms.ts", import.meta.url), "utf8");
  const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/platform-applications-panel.tsx", import.meta.url), "utf8");
  const status = await readFile(new URL("../app/platform/application-status.tsx", import.meta.url), "utf8");
  const domainRoute = await readFile(new URL("../app/api/platform/applications/domain/route.ts", import.meta.url), "utf8");
  const assetsRoute = await readFile(new URL("../app/api/platform/applications/assets/route.ts", import.meta.url), "utf8");
  const assetBindingRoute = await readFile(new URL("../app/api/platform/applications/assets/[assetId]/route.ts", import.meta.url), "utf8");
  const supportRoute = await readFile(new URL("../app/api/platform/applications/support/route.ts", import.meta.url), "utf8");
  const template = await readFile(new URL("../app/platform/templates/default/page.tsx", import.meta.url), "utf8");
  const agreement = await readFile(new URL("../app/platform/agreement/page.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0016_v33_platform_portal.sql", import.meta.url), "utf8");

  assert.match(platform, /Apply to join/);
  assert.match(platform, /Public template preview/);
  assert.match(platform, /Customer cases \/ examples/);
  assert.match(applicationForm, /companyName/);
  assert.match(applicationForm, /agreementAccepted/);
  assert.match(applicationForm, /platform\/agreement/);
  assert.match(applicationForm, /productImport/);
  assert.match(applicationsRoute, /runPlatformDeliveryJob/);
  assert.match(v61, /createSiteFromTemplate/);
  assert.match(v61, /merchant_owner/);
  assert.match(applicationsRoute, /DUPLICATE_APPLICATION/);
  assert.match(applicationsRoute, /ONBOARDING_APPLY_FAILED/);
  assert.match(status, /Launch checklist/);
  assert.match(status, /Send support request/);
  assert.match(domainRoute, /createPlatformDomainRequest/);
  assert.match(assetsRoute, /getMediaBucket/);
  assert.match(assetBindingRoute, /updatePlatformApplicationAsset/);
  assert.match(status, /Save binding/);
  assert.match(supportRoute, /createPlatformSupportTicket/);
  assert.match(template, /PUBLIC TEMPLATE PREVIEW/);
  assert.match(agreement, /Platform delivery/);
  assert.match(migration, /platform_application_events/);
  assert.match(migration, /platform_domain_requests/);
  assert.match(merchantProducts, /createClientProduct/);
  assert.match(merchantProducts, /deleteClientProduct/);
  assert.match(merchantCampaigns, /saveMerchantCollection/);
  assert.match(merchantCampaigns, /saveMerchantCampaignSchedule/);
  assert.match(merchantOperations, /getAnalyticsSummary/);
  assert.match(v32, /platform_applications/);
  assert.match(v32, /cms_campaign_schedules/);
  assert.match(v32, /syncMerchantCampaignSchedules/);
  assert.match(cms, /cms_collections/);
  assert.match(cms, /cms_recommendation_rules/);
  assert.match(workerSource, /syncMerchantCampaignSchedules/);
  assert.match(workspace, /MerchantCatalog/);
  assert.match(workspace, /MerchantMarketing/);
  assert.match(admin, /创建商户站点/);
  assert.match(admin, /createSite:true/);
  assert.equal((await render("/platform")).status, 200);
  assert.equal((await render("/platform/apply")).status, 200);
  assert.equal((await render("/platform/applications")).status, 200);
  assert.equal((await render("/platform/templates/default")).status, 200);
  assert.equal((await render("/platform/agreement")).status, 200);
});

test("keeps V46 P0 portal draft, template and notification closure", async () => {
  const form = await readFile(new URL("../app/platform/platform-application-form.tsx", import.meta.url), "utf8");
  const status = await readFile(new URL("../app/platform/application-status.tsx", import.meta.url), "utf8");
  const templates = await readFile(new URL("../app/platform/template-catalog.ts", import.meta.url), "utf8");
  const templatePreview = await readFile(new URL("../app/platform/templates/default/page.tsx", import.meta.url), "utf8");
  const applications = await readFile(new URL("../app/api/platform/applications/route.ts", import.meta.url), "utf8");
  const notifications = await readFile(new URL("../app/platform/application-notifications.ts", import.meta.url), "utf8");
  const notificationRoute = await readFile(new URL("../app/api/platform/applications/notifications/route.ts", import.meta.url), "utf8");
  const v32 = await readFile(new URL("../db/v32.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0019_v46_platform_portal_p0.sql", import.meta.url), "utf8");

  assert.match(form, /Save and continue/);
  assert.match(form, /applicationId/);
  assert.match(form, /platformTemplates/);
  assert.match(status, /Resume application/);
  assert.match(status, /Status notifications/);
  assert.match(templates, /studio/);
  assert.match(templates, /applyPlatformTemplateVariant/);
  assert.match(templatePreview, /searchParams/);
  assert.match(applications, /draft/);
  assert.match(applications, /sendPlatformApplicationNotification/);
  assert.match(notifications, /RESEND_NOT_CONFIGURED/);
  assert.match(notifications, /retryPlatformApplicationNotification/);
  assert.match(notificationRoute, /Only platform operators can retry/);
  assert.match(v32, /platform_application_notifications/);
  assert.match(migration, /dedupe_key/);
  assert.equal((await render("/platform/templates/default")).status, 200);
});

test("keeps V34 platform commercial, referral and email identity loops", async () => {
  const plans = await readFile(new URL("../app/platform/plans/page.tsx", import.meta.url), "utf8");
  const commercial = await readFile(new URL("../db/v34.ts", import.meta.url), "utf8");
  const commercialRoute = await readFile(new URL("../app/api/platform/commercial/route.ts", import.meta.url), "utf8");
  const referralRoute = await readFile(new URL("../app/api/platform/referrals/route.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../db/email-auth.ts", import.meta.url), "utf8");
  const authPage = await readFile(new URL("../app/auth/email-auth-page.tsx", import.meta.url), "utf8");
  const header = await readFile(new URL("../app/components/platform-portal-header.tsx", import.meta.url), "utf8");
  const merchant = await readFile(new URL("../app/merchant/page.tsx", import.meta.url), "utf8");
  const clientPortal = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0017_v34_platform_commercial.sql", import.meta.url), "utf8");

  assert.match(plans, /Billing interval/);
  assert.match(plans, /is-featured/);
  assert.match(commercial, /platform_agreements/);
  assert.match(commercial, /platform_billing_invoices/);
  assert.match(commercial, /platform_referral_rewards/);
  assert.match(commercialRoute, /sign_agreement/);
  assert.match(commercialRoute, /record_payment/);
  assert.match(referralRoute, /create_code/);
  assert.match(auth, /email_sessions/);
  assert.match(auth, /PBKDF2/);
  assert.match(authPage, /Create an account/);
  assert.match(header, /platform-nav-dropdown/);
  assert.match(header, /from "\.\/site-link"/);
  assert.doesNotMatch(header, /from "next\/link"/);
  assert.match(header, /auth\/login\?return_to=%2Fplatform/);
  assert.match(header, /申请入驻/);
  assert.doesNotMatch(header, /auth\/register\?return_to=%2Fplatform/);
  assert.doesNotMatch(plans, /from "next\/link"/);
  assert.doesNotMatch(merchant, /from "next\/link"/);
  assert.doesNotMatch(clientPortal, /from "next\/link"/);
  assert.match(migration, /platform_subscriptions/);
  assert.equal((await render("/platform/plans")).status, 200);
  assert.equal((await render("/auth/login")).status, 200);
  assert.equal((await render("/auth/register")).status, 200);
});

test("keeps V47 P0 portal delivery and identity recovery loops", async () => {
  const applicationApi = await readFile(new URL("../app/api/platform/applications/route.ts", import.meta.url), "utf8");
  const accessApi = await readFile(new URL("../app/api/platform/applications/access/route.ts", import.meta.url), "utf8");
  const ownerInviteApi = await readFile(new URL("../app/api/platform/applications/owner-invite/route.ts", import.meta.url), "utf8");
  const ownerPage = await readFile(new URL("../app/platform/owner-activate/page.tsx", import.meta.url), "utf8");
  const supportApi = await readFile(new URL("../app/api/platform/applications/support/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/platform-applications-panel.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../db/email-auth.ts", import.meta.url), "utf8");
  const v32 = await readFile(new URL("../db/v32.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0020_v47_platform_portal_p0.sql", import.meta.url), "utf8");

  assert.match(applicationApi, /site_creating/);
  assert.match(applicationApi, /selectPlatformPlan/);
  assert.match(applicationApi, /createPlatformOwnerInvite/);
  assert.match(accessApi, /resend_access_link/);
  assert.match(ownerInviteApi, /acceptPlatformOwnerInvite/);
  assert.match(ownerPage, /owner-invite/);
  assert.match(supportApi, /updatePlatformSupportTicket/);
  assert.match(admin, /审核与交付/);
  assert.match(admin, /保存域名处理结果/);
  assert.match(admin, /重试发送/);
  assert.match(auth, /EMAIL_NOT_VERIFIED/);
  assert.match(auth, /email_verified_at IS NOT NULL/);
  assert.match(v32, /owner_invite_status/);
  assert.match(v32, /rotatePlatformApplicationAccessToken/);
  assert.match(migration, /owner_invite_token_hash/);
});

test("keeps role-specific navigation and canonical workspace entry points", async () => {
  const storefrontHeader = await readFile(new URL("../app/components/site-header.tsx", import.meta.url), "utf8");
  const accessMenu = await readFile(new URL("../app/components/storefront-access-menu.tsx", import.meta.url), "utf8");
  const merchantWorkspace = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  const platformAdmin = await readFile(new URL("../app/admin/admin-v6.tsx", import.meta.url), "utf8");
  const platformHeader = await readFile(new URL("../app/components/platform-portal-header.tsx", import.meta.url), "utf8");

  assert.match(storefrontHeader, /slice\(0, 3\)/);
  assert.doesNotMatch(storefrontHeader, />Track order<|>Wishlist</);
  assert.match(accessMenu, /hasMerchantAccess/);
  assert.match(accessMenu, /hasPlatformAccess/);
  assert.match(merchantWorkspace, /selectSection/);
  assert.match(merchantWorkspace, /params\.set\("section"/);
  assert.match(merchantWorkspace, /BackofficeShell/);
  const shell = await readFile(new URL("../app/components/backoffice.tsx", import.meta.url), "utf8");
  assert.match(shell, /bo-breadcrumb/);
  assert.match(shell, /aria-expanded/);
  assert.match(platformAdmin, /roleVisibleAdminTabs/);
  assert.match(platformAdmin, /Platform work/);
  assert.match(platformAdmin, /BackofficeShell/);
  assert.match(platformHeader, /案例与资源/);
  assert.doesNotMatch(platformHeader, /auth\/register\?return_to=%2Fplatform/);
});
