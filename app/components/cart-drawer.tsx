"use client";

import { useEffect } from "react";
import Link from "./site-link";
import { QuantityControl } from "./product-actions";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { formatMoney } from "../lib/format-money";
import { showToast } from "./toast";

export function CartDrawer() {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart, subtotal, drawerOpen, closeDrawer, removeFromCart, saveForLater } = useStore(site?.id || activeSiteId);
  const threshold = Number(config.commerce.shipping?.freeThreshold || 100);
  const remaining = Math.max(0, threshold - subtotal);
  const hasStaleStock = cart.some((item) => {
    const variant = item.variants.find((candidate) => candidate.id === item.variantId);
    return Math.max(0, variant?.stock ?? item.stock) < item.quantity;
  });

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [closeDrawer, drawerOpen]);

  if (!drawerOpen) return null;
  return <div className="cart-drawer-layer"><button type="button" className="cart-drawer-backdrop" onClick={closeDrawer} aria-label="Close bag" /><aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title"><header className="cart-drawer-header"><div><p className="eyebrow">Your bag</p><h2 id="cart-drawer-title">Ready to go.</h2></div><button type="button" className="cart-drawer-close" onClick={closeDrawer} aria-label="Close bag">×</button></header>{cart.length ? <><div className="cart-drawer-lines">{cart.map((item) => { const variant = item.variants.find((candidate) => candidate.id === item.variantId); const maxQuantity = Math.max(0, variant?.stock ?? item.stock); const stale = maxQuantity < item.quantity; return <div className="cart-drawer-line" key={item.lineId}><Link href={`/products/${item.slug}`} onClick={closeDrawer} className="cart-drawer-image"><img src={item.images[0] || item.image} alt={item.alt} /></Link><div className="cart-drawer-copy"><Link href={`/products/${item.slug}`} onClick={closeDrawer}><strong>{item.name}</strong></Link><span>{item.variantLabel}</span>{stale && <small className="cart-stock-warning">Only {maxQuantity} available</small>}<div className="cart-line-actions"><button type="button" className="text-button" onClick={() => { if (saveForLater(item.lineId)) showToast(`${item.name} saved for later.`, "info"); }}>Save for later</button><button type="button" className="text-button" onClick={() => removeFromCart(item.lineId)}>Remove</button></div></div><div className="cart-drawer-actions"><strong>{formatMoney(item.variantPrice * item.quantity, config.commerce.currency)}</strong><QuantityControl id={item.lineId} quantity={item.quantity} maxQuantity={maxQuantity} /></div></div>; })}</div><div className="cart-drawer-footer">{hasStaleStock && <p className="cart-validation cart-validation-invalid" role="alert">Update item availability in your bag before checkout.</p>}{threshold > 0 && <p className={`free-shipping-meter ${remaining === 0 ? "is-complete" : ""}`}>{remaining ? `You’re ${formatMoney(remaining, config.commerce.currency)} away from free shipping.` : "You unlocked free shipping."}</p>}<div className="summary-total"><span>Subtotal</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div><Link href="/cart" onClick={closeDrawer} className="button button-outline button-wide">View bag</Link>{hasStaleStock ? <button type="button" className="button button-dark button-wide" disabled>Review bag before checkout</button> : <Link href="/checkout" onClick={closeDrawer} className="button button-dark button-wide">Checkout <span>→</span></Link>}</div></> : <div className="cart-drawer-empty"><span className="empty-mark">O</span><p>Your bag is empty.</p><Link href="/shop" onClick={closeDrawer} className="button button-dark">Browse gear</Link></div>}</aside></div>;
}
