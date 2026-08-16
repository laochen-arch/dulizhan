"use client";

import Link from "../components/site-link";
import { QuantityControl } from "../components/product-actions";
import { useStore } from "../components/cart-store";
import { useSiteRuntime } from "../components/site-runtime";
import { showToast } from "../components/toast";
import { formatMoney } from "../lib/format-money";
import { CartCoupon } from "../components/cart-coupon";

export default function CartPage() {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart, subtotal, hydrated, removeFromCart } = useStore(site?.id || activeSiteId);
  const threshold = Number(config.commerce.shipping?.freeThreshold || 100);
  const remainingForFreeShipping = Math.max(0, threshold - subtotal);
  const shippingProgress = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 100;
  const hasStaleStock = cart.some((item) => {
    const variant = item.variants.find((candidate) => candidate.id === item.variantId);
    return Math.max(0, variant?.stock ?? item.stock) < item.quantity;
  });
  if (!hydrated) return <div className="loading-state container section-pad">Loading your bag...</div>;
  if (!cart.length) return <div className="empty-state cart-empty container section-pad"><span className="empty-mark">O</span><p className="eyebrow">Your bag</p><h1>It&apos;s quiet in here.</h1><p>Start with a few things made for getting out there.</p><Link href="/shop" className="button button-dark">Explore the collection <span>-&gt;</span></Link></div>;
  return <div className="cart-page container section-pad"><div className="page-intro page-intro-small"><p className="eyebrow">{config.brand.name} / Your bag</p><h1>Ready when<br /><em>you are.</em></h1></div>{threshold > 0 && <section className="cart-shipping-progress" aria-label="Free shipping progress"><div><p className="eyebrow">Shipping benefit</p><strong>{remainingForFreeShipping ? `You’re ${formatMoney(remainingForFreeShipping, config.commerce.currency)} away from free shipping.` : "Free shipping unlocked."}</strong><span>{remainingForFreeShipping ? "Add one more considered essential to reach the threshold." : "Your order qualifies for standard free shipping."}</span></div><div className="cart-shipping-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shippingProgress} aria-label={`${shippingProgress}% toward free shipping`}><span style={{ width: `${shippingProgress}%` }} /></div></section>}<div className="cart-layout"><div className="cart-lines">{cart.map((item) => { const variant = item.variants.find((candidate) => candidate.id === item.variantId); const maxQuantity = Math.max(0, variant?.stock ?? item.stock); const stale = maxQuantity < item.quantity; return <div className="cart-line" key={item.lineId}><img src={item.images[0] || item.image} alt={item.alt} /><div className="cart-line-copy"><p className="eyebrow">{item.category}</p><h2>{item.name}</h2><p>{item.variantLabel}</p>{stale && <p className="cart-stock-warning" role="alert">Only {maxQuantity} available. Reduce the quantity before checkout.</p>}<button type="button" className="remove-button" onClick={() => { removeFromCart(item.lineId); showToast(`${item.name} removed from your bag.`, "info"); }}>Remove</button></div><QuantityControl id={item.lineId} quantity={item.quantity} maxQuantity={maxQuantity} /><div className="cart-line-price">{formatMoney(item.variantPrice * item.quantity, config.commerce.currency)}</div></div>; })}</div><aside className="cart-summary"><p className="eyebrow">Order summary</p><div className="summary-row"><span>Subtotal</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><CartCoupon /><div className="summary-total"><span>Total</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div>{hasStaleStock ? <button type="button" className="button button-dark button-wide" disabled>Review item availability</button> : <Link href="/checkout" className="button button-dark button-wide">Continue to checkout <span>-&gt;</span></Link>}<Link href="/shop" className="cart-continue">Continue shopping <span aria-hidden="true">→</span></Link><p className="secure-note">Secure checkout - Taxes calculated at checkout</p></aside></div></div>;
}
