import { headers } from "next/headers";
import { requireChatGPTUser } from "../chatgpt-auth";
import { findMember, resolveSiteByHost } from "../../db/cms";
import { getMerchantMembership, getMerchantWorkspaceOverview } from "../../db/v25";
import { formatMoney } from "../lib/format-money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Merchant workspace" };

export default async function MerchantWorkspacePage() {
  const user = await requireChatGPTUser("/manage");
  const requestHeaders = await headers();
  const site = await resolveSiteByHost(requestHeaders.get("host"));
  const member = await getMerchantMembership(site.id, user.userId, user.email);
  if (!member) return <main className="manage-shell container"><section className="manage-access-denied"><p className="eyebrow">Merchant workspace</p><h1>This storefront is not assigned to you.</h1><p>Your account is signed in, but it does not have a merchant role for {site.name}. Ask the site owner to invite you as an owner, manager or staff member.</p><a className="button button-outline" href="/account">Back to account <span>→</span></a></section></main>;
  const overview = await getMerchantWorkspaceOverview(site.id, user.userId, user.email);
  const cmsMember = await findMember(site.id, user.userId, user.email);
  const canProducts = overview.capabilities.includes("products.read");
  const canInventory = overview.capabilities.includes("inventory.read");
  const canOrders = overview.capabilities.includes("orders.read");
  return <main className="manage-shell container">
    <header className="manage-header"><div><p className="eyebrow">{overview.site.name} / Merchant workspace</p><h1>Operate the store<br /><em>with clarity.</em></h1><p>Tenant-scoped operations for products, inventory and customer orders. Your access is controlled by the merchant role below.</p></div><div className="manage-header-actions"><span className="manage-role-badge">{member.role.replace("merchant_", "")} access</span><a className="button button-outline" href="/account">My account <span>→</span></a>{cmsMember && <a className="button button-dark" href="/admin">Open Studio <span>↗</span></a>}</div></header>
    <section className="manage-summary-grid"><div><span>Orders</span><strong>{overview.orders.length}</strong><small>Latest tenant orders</small></div><div><span>Live products</span><strong>{overview.products.length}</strong><small>{canProducts ? "Catalog access enabled" : "No catalog access"}</small></div><div><span>Available units</span><strong>{overview.inventory.units}</strong><small>{canInventory ? `${overview.inventory.lowStock} low-stock rows` : "Inventory access limited"}</small></div><div><span>Signed in as</span><strong className="manage-summary-email">{user.email}</strong><small>Identity is site-scoped</small></div></section>
    <section className="manage-grid"><article className="manage-panel"><div className="manage-panel-heading"><div><p className="eyebrow">Customer orders</p><h2>Keep every handoff visible.</h2></div><span>{canOrders ? "Read / operate" : "Restricted"}</span></div>{canOrders && overview.orders.length ? <div className="manage-order-list">{overview.orders.slice(0, 8).map((order) => <div key={order.id}><span><strong>{order.orderNumber}</strong><small>{order.customerName} · {order.email}</small></span><span><strong>{formatMoney(order.total, order.currency)}</strong><small>{order.paymentStatus} / {order.fulfillmentStatus}</small></span><span>{order.trackingNumber ? `Tracking ${order.trackingNumber}` : "No tracking"}</span></div>)}</div> : <div className="manage-empty">No accessible orders are available for this workspace.</div>}</article><aside className="manage-panel manage-panel-dark"><p className="eyebrow">Role boundary</p><h2>{member.role === "merchant_owner" ? "You own the storefront." : member.role === "merchant_manager" ? "You manage daily operations." : "You keep fulfillment moving."}</h2><p>{member.role === "merchant_owner" ? "Settings, team, catalog, inventory and orders are available to you." : member.role === "merchant_manager" ? "You can work on products, inventory, orders and after-sales without changing payment or domain secrets." : "You can work on orders, fulfillment and inventory without access to branding, domains or team settings."}</p><div className="manage-capabilities">{overview.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></aside></section>
    <section className="manage-grid manage-lower-grid"><article className="manage-panel"><p className="eyebrow">Catalog snapshot</p><h2>{canProducts ? "Products are tenant-scoped." : "Catalog access is restricted."}</h2>{canProducts && <div className="manage-product-list">{overview.products.slice(0, 8).map((product) => <div key={product.id}><span><strong>{product.name}</strong><small>{product.category} · {product.status}</small></span><span>{formatMoney(product.price, "USD")}</span><span>{product.stock} units</span></div>)}</div>}</article><article className="manage-panel"><p className="eyebrow">Inventory signal</p><h2>{overview.inventory.lowStock ? `${overview.inventory.lowStock} rows need attention.` : "Inventory looks healthy."}</h2><p className="manage-muted">Available units are calculated after reserved stock. Product and order data never crosses into another site ID.</p><a className="text-link" href="/account">Switch to customer account →</a></article></section>
  </main>;
}
