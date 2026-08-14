"use client";

import Link from "next/link";
import { QuantityControl } from "../components/product-actions";
import { useStore } from "../components/cart-store";

export default function CartPage() {
  const { cart, subtotal, hydrated, removeFromCart } = useStore();
  if (!hydrated) return <div className="loading-state container section-pad">Loading your bag…</div>;
  if (!cart.length) return <div className="empty-state cart-empty container section-pad"><span className="empty-mark">◌</span><p className="eyebrow">Your bag</p><h1>It’s quiet in here.</h1><p>Start with a few things made for getting out there.</p><Link href="/shop" className="button button-dark">Explore the collection <span>↗</span></Link></div>;
  return <div className="cart-page container section-pad"><div className="page-intro page-intro-small"><p className="eyebrow">Northline / Your bag</p><h1>Ready when<br /><em>you are.</em></h1></div><div className="cart-layout"><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.id}><img src={item.image} alt={item.alt} /><div className="cart-line-copy"><p className="eyebrow">{item.category}</p><h2>{item.name}</h2><p>{item.colors[0]}</p><button className="remove-button" onClick={() => removeFromCart(item.id)}>Remove</button></div><QuantityControl id={item.id} quantity={item.quantity} /><div className="cart-line-price">${item.price * item.quantity}</div></div>)}</div><aside className="cart-summary"><p className="eyebrow">Order summary</p><div className="summary-row"><span>Subtotal</span><strong>${subtotal}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-total"><span>Total</span><strong>${subtotal}</strong></div><Link href="/checkout" className="button button-dark button-wide">Continue to checkout <span>↗</span></Link><p className="secure-note">Secure checkout · Taxes calculated at checkout</p></aside></div></div>;
}
