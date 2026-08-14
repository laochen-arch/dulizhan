"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckoutForm } from "../components/checkout-form";
import { useStore } from "../components/cart-store";

export default function CheckoutPage() {
  const { cart, subtotal, hydrated, clearCart } = useStore();
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const clearedSession = useRef(false);
  const cancelled = searchParams.get("cancelled") === "1";
  const paidSession = Boolean(searchParams.get("session_id"));
  useEffect(() => {
    if (paidSession && !clearedSession.current) {
      clearedSession.current = true;
      clearCart();
    }
  }, [clearCart, paidSession]);
  if (!hydrated) return <div className="loading-state container section-pad">Loading secure checkout...</div>;
  if (submitted || paidSession) return <div className="empty-state container section-pad"><span className="empty-mark">OK</span><p className="eyebrow">Payment received</p><h1>See you out there.</h1><p>Your payment is being confirmed. A receipt and order update will be sent to your email.</p><Link href="/shop" className="button button-dark">Continue shopping -&gt;</Link></div>;
  if (!cart.length) return <div className="empty-state container section-pad"><span className="empty-mark">O</span><h1>Your bag is empty.</h1><p>Add something before you check out.</p><Link href="/shop" className="button button-dark">Browse gear -&gt;</Link></div>;
  return <div className="checkout-page container section-pad"><div className="breadcrumbs"><Link href="/cart">Bag</Link><span>/</span><span>Checkout</span></div>{cancelled && <div className="v6-notice info" role="status">Payment was canceled. Your bag is still saved.</div>}<div className="checkout-layout"><CheckoutForm onComplete={() => setSubmitted(true)} /><aside className="checkout-summary"><p className="eyebrow">Your order</p>{cart.map((item) => <div className="checkout-line" key={item.lineId}><img src={item.images[0] || item.image} alt="" /><div><strong>{item.name}</strong><span>{item.variantLabel} - Qty {item.quantity}</span></div><strong>${item.variantPrice * item.quantity}</strong></div>)}<div className="summary-total"><span>Total</span><strong>${subtotal}</strong></div><p className="secure-note">Secure card payment. Free US shipping on orders over $100.</p></aside></div></div>;
}
