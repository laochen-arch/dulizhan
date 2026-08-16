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
  assert.match(admin, /V22 control/);
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
  assert.match(clientPage, /Save encrypted credentials/);
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
  assert.match(portal, /Variant \/ SKU management/);
  assert.match(portal, /Submit a verified after-sales case/);
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
  assert.match(admin, /admin-workspace-status/);
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
  const cms = await readFile(new URL("../db/cms.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/client/client-portal.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/platform-applications-panel.tsx", import.meta.url), "utf8");

  assert.match(platform, /Apply to join/);
  assert.match(applicationForm, /companyName/);
  assert.match(applicationsRoute, /createSiteFromTemplate/);
  assert.match(applicationsRoute, /merchant_owner/);
  assert.match(merchantProducts, /createClientProduct/);
  assert.match(merchantProducts, /deleteClientProduct/);
  assert.match(merchantCampaigns, /saveMerchantCollection/);
  assert.match(merchantCampaigns, /saveMerchantCampaignSchedule/);
  assert.match(merchantOperations, /getAnalyticsSummary/);
  assert.match(v32, /platform_applications/);
  assert.match(v32, /cms_campaign_schedules/);
  assert.match(cms, /cms_collections/);
  assert.match(cms, /cms_recommendation_rules/);
  assert.match(workspace, /Create draft product/);
  assert.match(workspace, /Scheduled campaigns/);
  assert.match(admin, /Create storefront/);
  assert.equal((await render("/platform")).status, 200);
  assert.equal((await render("/platform/apply")).status, 200);
});
