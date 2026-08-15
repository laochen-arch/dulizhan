"use client";

import Link from "../components/site-link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckoutForm } from "../components/checkout-form";
import { useStore } from "../components/cart-store";
import { useSiteRuntime } from "../components/site-runtime";
import { formatMoney } from "../lib/format-money";

export default function CheckoutPage() {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart, subtotal, hydrated, clearCart } = useStore(site?.id || activeSiteId);
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [paymentState, setPaymentState] = useState<"checking" | "paid" | "pending" | "cancelled" | "failed">("checking");
  const [orderNumber, setOrderNumber] = useState("");
  const clearedSession = useRef(false);
  const statusStarted = useRef(false);
  const cancelled = searchParams.get("cancelled") === "1";
  const paypalOrderId = searchParams.get("token") || searchParams.get("paypal_order_id") || "";
  const paypalReturn = searchParams.get("paypal_return") === "1";
  const orderId = searchParams.get("order_id") || "";
  const paidSession = Boolean(paypalOrderId);

  useEffect(() => {
    if (cancelled || !paidSession || statusStarted.current) return;
    statusStarted.current = true;
    let active = true;
    let attempts = 0;
    let timer: number | undefined;
    const poll = async () => {
      attempts += 1;
      try {
        if (paypalReturn && attempts === 1) await fetch("/api/paypal/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, paypalOrderId }) });
        const response = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(orderId)}&paypalOrderId=${encodeURIComponent(paypalOrderId)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { status?: { paymentStatus?: string; status?: string; orderNumber?: string } };
        if (active && payload.status) {
          setOrderNumber(payload.status.orderNumber || "");
          if (payload.status.paymentStatus === "paid") {
            if (!clearedSession.current) {
              clearedSession.current = true;
              clearCart();
            }
            return setPaymentState("paid");
          }
          if (payload.status.paymentStatus === "failed" || payload.status.status === "payment_failed") return setPaymentState("failed");
          if (payload.status.status === "cancelled") return setPaymentState("cancelled");
        }
      } catch {
        // The PayPal capture or webhook may arrive shortly after the redirect back.
      }
      if (active && attempts < 8) timer = window.setTimeout(() => void poll(), 1500);
      else if (active) setPaymentState("pending");
    };
    void poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [cancelled, clearCart, orderId, paidSession, paypalOrderId, paypalReturn]);

  if (!hydrated) return <div className="loading-state container section-pad">Loading secure checkout...</div>;
  const visiblePaymentState = cancelled ? "cancelled" : paymentState;
  if (submitted || paidSession || cancelled) return <div className="empty-state container section-pad"><span className="empty-mark">{visiblePaymentState === "paid" ? "OK" : visiblePaymentState === "failed" ? "!" : "-"}</span><p className="eyebrow">{visiblePaymentState === "paid" ? "Payment confirmed" : visiblePaymentState === "cancelled" ? "Payment canceled" : visiblePaymentState === "failed" ? "Payment failed" : "Payment pending"}</p><h1>{visiblePaymentState === "paid" ? "See you out there." : "Your bag is still here."}</h1><p>{visiblePaymentState === "paid" ? `Order ${orderNumber || "confirmed"}. A receipt and order update will be sent to your email.` : visiblePaymentState === "cancelled" ? "No charge was made. Your bag is still saved so you can try again." : visiblePaymentState === "failed" ? "The payment was not completed. No new charge was confirmed, and your bag is still saved so you can try again." : "PayPal has returned you to the storefront. We are confirming your payment and will update the order shortly."}</p><Link href={visiblePaymentState === "paid" ? "/shop" : "/cart"} className="button button-dark">{visiblePaymentState === "paid" ? "Continue shopping" : "Return to bag"}</Link></div>;
  if (!cart.length) return <div className="empty-state container section-pad"><span className="empty-mark">O</span><h1>Your bag is empty.</h1><p>Add something before you check out.</p><Link href="/shop" className="button button-dark">Browse gear</Link></div>;
  return <div className="checkout-page container section-pad"><div className="breadcrumbs"><Link href="/cart">Bag</Link><span>/</span><span>Checkout</span></div><div className="checkout-layout"><CheckoutForm onComplete={() => setSubmitted(true)} /><aside className="checkout-summary"><p className="eyebrow">Your order</p>{cart.map((item) => <div className="checkout-line" key={item.lineId}><img src={item.images[0] || item.image} alt="" /><div><strong>{item.name}</strong><span>{item.variantLabel} - Qty {item.quantity}</span></div><strong>{formatMoney(item.variantPrice * item.quantity, config.commerce.currency)}</strong></div>)}<div className="summary-total"><span>Estimated total</span><strong>{formatMoney(subtotal, config.commerce.currency)}</strong></div><p className="secure-note">Secure PayPal checkout. {config.announcement.text}</p></aside></div></div>;
}
