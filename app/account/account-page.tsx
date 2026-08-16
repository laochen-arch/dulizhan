"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "../lib/format-money";
import { ProductCard } from "../components/product-card";
import { useSiteRuntime } from "../components/site-runtime";
import { useWishlist } from "../components/wishlist-context";
import { ReorderButton } from "../components/reorder-button";
import { formatFulfillmentStatus, formatPaymentStatus } from "../lib/order-status";

type Access = {
  authenticated: boolean;
  user: { id: string; email: string; displayName: string } | null;
  site: { id: string; name: string };
};

type Profile = { displayName: string; email: string; phone: string | null };
type Order = { id: string; orderNumber: string; currency: string; total: number; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string; refundTotal: number };
type Address = { id: string; label: string; firstName: string; lastName: string; address: string; city: string; region: string; zip: string; country: string; phone: string | null; isDefault: boolean };

const emptyAddress = { label: "Shipping address", firstName: "", lastName: "", address: "", city: "", region: "", zip: "", country: "United States", phone: "", isDefault: false };

export function AccountPage() {
  const { catalog } = useSiteRuntime();
  const { ids: wishlistIds, hydrated: wishlistHydrated } = useWishlist();
  const [access, setAccess] = useState<Access | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState(emptyAddress);
  const [tab, setTab] = useState<"overview" | "orders" | "addresses" | "saved" | "profile">("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function readJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load your account.");
    return payload;
  }

  async function loadAccount() {
    setError("");
    try {
      const session = await readJson<{ access: Access }>("/api/account/session");
      setAccess(session.access);
      if (!session.access.authenticated) return;
      const [profilePayload, orderPayload, addressPayload] = await Promise.all([
        readJson<{ profile: Profile }>("/api/account/profile"),
        readJson<{ orders: Order[] }>("/api/account/orders"),
        readJson<{ addresses: Address[] }>("/api/account/addresses"),
      ]);
      setProfile(profilePayload.profile);
      setOrders(orderPayload.orders);
      setAddresses(addressPayload.addresses);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your account.");
      setAccess({ authenticated: false, user: null, site: { id: "", name: "" } });
    }
  }

  // Defer the first request until after the initial paint so the account shell
  // can render without a synchronous state update inside the effect body.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { void loadAccount(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const payload = await readJson<{ profile: Profile }>("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      setProfile(payload.profile); setMessage("Profile saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save your profile."); }
    finally { setBusy(false); }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const payload = await readJson<{ address: Address }>("/api/account/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(address) });
      if (payload.address) setAddresses((current) => [payload.address, ...current.filter((item) => item.id !== payload.address.id).map((item) => payload.address.isDefault ? { ...item, isDefault: false } : item)]);
      setAddress(emptyAddress); setMessage("Address saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this address."); }
    finally { setBusy(false); }
  }

  async function setDefaultAddress(item: Address) {
    setBusy(true); setMessage(""); setError("");
    try {
      await readJson(`/api/account/addresses/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, isDefault: true }) });
      setAddresses((current) => current.map((candidate) => ({ ...candidate, isDefault: candidate.id === item.id })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the default address."); }
    finally { setBusy(false); }
  }

  async function removeAddress(item: Address) {
    setBusy(true); setMessage(""); setError("");
    try {
      await readJson(`/api/account/addresses/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setAddresses((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete this address."); }
    finally { setBusy(false); }
  }

  const savedProducts = catalog.filter((product) => wishlistIds.includes(product.id) && product.status === "active");

  if (!access) return <main className="account-shell container"><section className="account-loading"><p className="eyebrow">Your account</p><h1>Loading your space.</h1></section></main>;

  if (!access.authenticated) return <main className="account-shell container"><section className="account-signin"><p className="eyebrow">Northline account</p><h1>Keep your orders<br /><em>in one place.</em></h1><p>Sign in to view orders, delivery status and saved addresses. This hosted version uses the secure workspace sign-in supplied by the site platform.</p><a className="button button-dark" href="/signin-with-chatgpt?return_to=%2Faccount">Sign in to continue <span>→</span></a><p className="account-note">Guest checkout and order lookup remain available from <a href="/orders">Track order</a>.</p></section></main>;

  return <main className="account-shell container">
    <header className="account-header"><div><p className="eyebrow">{access.site.name} / Account</p><h1>Welcome back,<br /><em>{profile?.displayName || access.user?.displayName || "traveler"}.</em></h1></div><a className="text-link" href="/signout-with-chatgpt?return_to=%2F">Sign out →</a></header>
    {(error || message) && <p className={error ? "form-error" : "form-help"} role={error ? "alert" : "status"}>{error || message}</p>}
    <nav className="account-tabs" aria-label="Account sections">
      {([["overview", "Overview"], ["orders", "Orders"], ["addresses", "Addresses"], ["saved", "Saved"], ["profile", "Profile"]] as const).map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => { setTab(key); setMessage(""); setError(""); }}>{label}</button>)}
    </nav>

    {tab === "overview" && <section className="account-dashboard"><div className="account-stat-grid"><button type="button" onClick={() => setTab("orders")}><span>Orders</span><strong>{orders.length}</strong><small>View order history →</small></button><button type="button" onClick={() => setTab("addresses")}><span>Saved addresses</span><strong>{addresses.length}</strong><small>Manage delivery details →</small></button><button type="button" onClick={() => setTab("saved")}><span>Saved gear</span><strong>{wishlistIds.length}</strong><small>Revisit your shortlist →</small></button><div><span>Account email</span><strong className="account-stat-email">{profile?.email}</strong><small>Used for order updates</small></div></div><div className="account-split"><article><p className="eyebrow">Latest order</p>{orders[0] ? <><h2>{orders[0].orderNumber}</h2><p>{formatPaymentStatus(orders[0].paymentStatus)} · {formatFulfillmentStatus(orders[0].fulfillmentStatus)}</p><a className="text-link" href={`/account/orders/${encodeURIComponent(orders[0].id)}`}>View order details →</a></> : <><h2>No orders yet.</h2><p>Your next trip can start with the collection.</p><a className="text-link" href="/shop">Browse products →</a></>}</article><article className="account-dark-card"><p className="eyebrow">Need order support?</p><h2>Track a guest order.</h2><p>Use the order number and checkout email to access delivery and after-sales support.</p><a className="button button-light" href="/orders">Track order <span>→</span></a></article></div></section>}

    {tab === "saved" && <section className="account-panel account-saved-panel"><div className="account-panel-heading"><div><p className="eyebrow">Your shortlist</p><h2>Saved gear.</h2></div><a className="text-link" href="/shop">Keep browsing →</a></div>{!wishlistHydrated ? <div className="account-empty"><h3>Loading your saved gear.</h3><p>Your shortlist is syncing across this device and your account.</p></div> : savedProducts.length ? <div className="product-grid account-saved-grid">{savedProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="account-empty"><h3>No saved products yet.</h3><p>Tap Save on a product card to keep a shortlist for your next trip.</p><a className="button button-dark" href="/shop">Browse products <span>→</span></a></div>}</section>}

    {tab === "orders" && <section className="account-panel"><div className="account-panel-heading"><div><p className="eyebrow">Order history</p><h2>Your orders.</h2></div><a className="text-link" href="/shop">Shop the collection →</a></div>{orders.length ? <div className="account-order-list">{orders.map((order) => <div className="account-order-row" key={order.id}><a href={`/account/orders/${encodeURIComponent(order.id)}`}><span><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString()} · {formatPaymentStatus(order.paymentStatus)}</small></span><span><strong>{formatMoney(order.total, order.currency)}</strong><small>{order.trackingNumber ? `Tracking ${order.trackingNumber}` : formatFulfillmentStatus(order.fulfillmentStatus)}</small></span><span aria-hidden="true">↗</span></a><ReorderButton orderId={order.id} /></div>)}</div> : <div className="account-empty"><h3>No account orders yet.</h3><p>Orders placed with this email will appear here after payment confirmation.</p></div>}</section>}

    {tab === "addresses" && <section className="account-address-layout"><article className="account-panel"><p className="eyebrow">Address book</p><h2>Where should we send it?</h2><div className="account-address-list">{addresses.map((item) => <div className={`account-address-card ${item.isDefault ? "is-default" : ""}`} key={item.id}><div><span className="account-address-label">{item.label}{item.isDefault ? " · Default" : ""}</span><strong>{item.firstName} {item.lastName}</strong><p>{item.address}<br />{item.city}, {item.region} {item.zip}<br />{item.country}{item.phone ? ` · ${item.phone}` : ""}</p></div><div className="account-address-actions">{!item.isDefault && <button type="button" className="text-button" disabled={busy} onClick={() => void setDefaultAddress(item)}>Make default</button>}<button type="button" className="text-button danger" disabled={busy} onClick={() => void removeAddress(item)}>Remove</button></div></div>)}{!addresses.length && <div className="account-empty"><h3>No saved addresses.</h3><p>Add one here to speed up your next checkout.</p></div>}</div></article><article className="account-panel"><p className="eyebrow">Add an address</p><h2>Save delivery details.</h2><form className="account-form" onSubmit={addAddress}><label><span>Label</span><input value={address.label} onChange={(event) => setAddress((current) => ({ ...current, label: event.target.value }))} /></label><div className="account-form-grid"><label><span>First name</span><input required value={address.firstName} onChange={(event) => setAddress((current) => ({ ...current, firstName: event.target.value }))} /></label><label><span>Last name</span><input required value={address.lastName} onChange={(event) => setAddress((current) => ({ ...current, lastName: event.target.value }))} /></label></div><label><span>Address</span><input required value={address.address} onChange={(event) => setAddress((current) => ({ ...current, address: event.target.value }))} /></label><div className="account-form-grid account-form-grid-three"><label><span>City</span><input required value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} /></label><label><span>State / region</span><input required value={address.region} onChange={(event) => setAddress((current) => ({ ...current, region: event.target.value }))} /></label><label><span>ZIP</span><input required value={address.zip} onChange={(event) => setAddress((current) => ({ ...current, zip: event.target.value }))} /></label></div><label><span>Country</span><select value={address.country} onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value }))}><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option></select></label><label><span>Phone (optional)</span><input value={address.phone} onChange={(event) => setAddress((current) => ({ ...current, phone: event.target.value }))} /></label><label className="account-check"><input type="checkbox" checked={address.isDefault} onChange={(event) => setAddress((current) => ({ ...current, isDefault: event.target.checked }))} /><span>Make this my default address</span></label><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : "Save address"} <span>→</span></button></form></article></section>}

    {tab === "profile" && profile && <section className="account-panel account-profile-panel"><p className="eyebrow">Personal details</p><h2>Keep your account current.</h2><form className="account-form" onSubmit={saveProfile}><label><span>Email address</span><input value={profile.email} readOnly /></label><label><span>Display name</span><input required value={profile.displayName} onChange={(event) => setProfile((current) => current ? { ...current, displayName: event.target.value } : current)} /></label><label><span>Phone</span><input value={profile.phone || ""} onChange={(event) => setProfile((current) => current ? { ...current, phone: event.target.value } : current)} /></label><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : "Save profile"} <span>→</span></button></form></section>}
  </main>;
}
