"use client";

import Link from "../components/site-link";
import { QuantityControl } from "../components/product-actions";
import { useStore } from "../components/cart-store";
import { useSiteRuntime } from "../components/site-runtime";
import { showToast } from "../components/toast";
import { formatMoney } from "../lib/format-money";

export default function CartPage() {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart, subtotal, hydrated, removeFromCart } = useStore(site?.id || activeSiteId);
  if (!hydrated) return <div className="loading-state container section-pad">Loading your bag...</div>;
  if (!cart.length) return <div className="empty-state cart-empty container section-pad"><span className="empty-mark">O</span><p className="eyebrow">Your bag</p><h1>It&apos;s quiet in here.</h1><p>Start with a few things made for getting out there.</p><Link href="/shop" className="button button-dark">Explore the collection <span>-&gt;</span></Link></div>;
  return <div className="cart-page container section-pad"><div className="page-intro page-intro-small"><p className="eyebrow">{config.brand.name} / Your bag</p><h1>Ready when<br /><em>you are.</em></h1></div><div className="cart-layout"><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.lineId}><img src={item.images[0] || item.image} alt={item.alt} /><div className="cart-line-copy"><p className="eyebrow">{item.category}</p><h2>{item.name}</h2><p>{item.variantLabel}</p><button type="button" className="remove-button" onClick={() => { removeFromCart(item.lineId); showToast(`${item.name} removed from your bag.`, "info"); }}>Remove</button></div><QuantityControl id={item.lineId} quantity={item.quantity} /><div className="cart-line-price">{formatMoney(item.variantPrice * item.quantity, config.commerce.currency)}</div></div>)}</div><aside className="cart-summary"><p className="eyebrow">Order summary</p><div className="summary-row"><span>Subtotal</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-total"><span>Total</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div><Link href="/checkout" className="button button-dark button-wide">Continue to checkout <span>-&gt;</span></Link><p className="secure-note">Secure checkout - Taxes calculated at checkout</p></aside></div></div>;
}
