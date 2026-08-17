"use client";

import Link from "../components/site-link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckoutForm, type CheckoutQuote } from "../components/checkout-form";
import { useStore } from "../components/cart-store";
import { useSiteRuntime } from "../components/site-runtime";
import { trackAnalytics } from "../components/analytics-tracker";
import { formatMoney } from "../lib/format-money";

export default function CheckoutPage() {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart, subtotal, hydrated, clearCart } = useStore(site?.id || activeSiteId);
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [paymentState, setPaymentState] = useState<"checking" | "paid" | "pending" | "cancelled" | "failed">("checking");
  const [orderNumber, setOrderNumber] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [statusRefresh, setStatusRefresh] = useState(0);
  const clearedSession = useRef(false);
  const statusStarted = useRef(false);
  const paymentEvent = useRef("");
  const cancelled = searchParams.get("cancelled") === "1";
  const paypalOrderId = searchParams.get("token") || searchParams.get("paypal_order_id") || "";
  const paypalReturn = searchParams.get("paypal_return") === "1";
  const orderId = searchParams.get("order_id") || "";
  const paidSession = Boolean(paypalOrderId);

  useEffect(() => {
    if (!paidSession || !["paid", "pending", "cancelled", "failed"].includes(paymentState)) return;
    const key = `${orderId}:${paymentState}`;
    if (paymentEvent.current === key) return;
    paymentEvent.current = key;
    trackAnalytics(`paypal_payment_${paymentState}`, { payload: { orderId, paypalOrderId } });
  }, [orderId, paidSession, paypalOrderId, paymentState]);

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
        const payload = await response.json().catch(() => ({})) as { status?: { paymentStatus?: string; status?: string; orderNumber?: string; accessToken?: string; accessExpiresAt?: string } };
        if (active && payload.status) {
          setOrderNumber(payload.status.orderNumber || "");
          setAccessToken(payload.status.accessToken || "");
          setAccessExpiresAt(payload.status.accessExpiresAt || "");
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
    return () => { active = false; if (timer) window.clearTimeout(timer); statusStarted.current = false; };
  }, [cancelled, clearCart, orderId, paidSession, paypalOrderId, paypalReturn, statusRefresh]);

  if (!hydrated) return <div className="loading-state container section-pad">Loading secure checkout...</div>;
  const visiblePaymentState = cancelled ? "cancelled" : paymentState;
  async function retryPayment() {
    if (!orderId || !paypalOrderId) return;
    setRetrying(true); setRetryError("");
    try {
      const response = await fetch("/api/checkout/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, paypalOrderId }) });
      const payload = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "Unable to restart PayPal checkout.");
      window.location.assign(payload.checkoutUrl);
    } catch (cause) { setRetryError(cause instanceof Error ? cause.message : "Unable to restart PayPal checkout."); setRetrying(false); }
  }

  function refreshPaymentStatus() {
    statusStarted.current = false;
    setPaymentState("checking");
    setStatusRefresh((current) => current + 1);
  }

  if (submitted || paidSession || cancelled) return <div className="empty-state container section-pad"><span className="empty-mark">{visiblePaymentState === "paid" ? "OK" : visiblePaymentState === "failed" ? "!" : "-"}</span><p className="eyebrow">{visiblePaymentState === "paid" ? "Payment confirmed" : visiblePaymentState === "cancelled" ? "Payment canceled" : visiblePaymentState === "failed" ? "Payment failed" : "Payment pending"}</p><h1>{visiblePaymentState === "paid" ? "See you out there." : "Your bag is still here."}</h1><p>{visiblePaymentState === "paid" ? `Order ${orderNumber || "confirmed"}. A receipt and order update will be sent to your email.` : visiblePaymentState === "cancelled" ? "No charge was made. Your bag is still saved so you can try again." : visiblePaymentState === "failed" ? "The payment was not completed. No new charge was confirmed, and your bag is still saved so you can try again." : "PayPal has returned you to the storefront. We are confirming your payment and will update the order shortly."}</p>{visiblePaymentState === "paid" && accessToken && <p className="form-help">Your private order link is valid until {accessExpiresAt ? new Date(accessExpiresAt).toLocaleString() : "tomorrow"}.</p>}{visiblePaymentState === "pending" && <div className="checkout-pending-actions"><button type="button" className="button button-outline" onClick={refreshPaymentStatus}>Refresh payment status</button><p className="form-help">If you already approved PayPal, give the webhook a moment to arrive before refreshing.</p></div>}{visiblePaymentState === "failed" && <div className="checkout-retry"><button type="button" className="button button-outline" disabled={retrying} onClick={() => void retryPayment()}>{retrying ? "Restarting PayPal..." : "Try PayPal again"}</button>{retryError && <p className="form-error" role="alert">{retryError}</p>}</div>}<div className="checkout-result-actions">{visiblePaymentState === "paid" && accessToken && <Link href={`/orders?token=${encodeURIComponent(accessToken)}`} className="button button-outline">View order details</Link>}<Link href={visiblePaymentState === "paid" ? "/shop" : "/cart"} className="button button-dark">{visiblePaymentState === "paid" ? "Continue shopping" : "Return to bag"}</Link></div></div>;
  if (!cart.length) return <div className="empty-state container section-pad"><span className="empty-mark">O</span><h1>Your bag is empty.</h1><p>Add something before you check out.</p><Link href="/shop" className="button button-dark">Browse gear</Link></div>;
  const summary = quote || { subtotal, discount: 0, shipping: null as number | null, total: subtotal };
  return <div className="checkout-page container section-pad"><div className="breadcrumbs"><Link href="/cart">Bag</Link><span>/</span><span>Checkout</span></div><div className="checkout-layout"><CheckoutForm onComplete={() => setSubmitted(true)} onQuoteChange={setQuote} /><aside className="checkout-summary"><p className="eyebrow">Your order</p>{cart.map((item) => <div className="checkout-line" key={item.lineId}><img src={item.images[0] || item.image} alt="" /><div><strong>{item.name}</strong><span>{item.variantLabel} - Qty {item.quantity}</span></div><strong>{formatMoney(item.variantPrice * item.quantity, config.commerce.currency)}</strong></div>)}<div className="summary-breakdown"><div><span>Subtotal</span><strong>{formatMoney(summary.subtotal, config.commerce.currency)}</strong></div>{summary.discount > 0 && <div className="summary-discount"><span>Discount</span><strong>-{formatMoney(summary.discount, config.commerce.currency)}</strong></div>}<div><span>Shipping</span><strong>{summary.shipping === null ? "Calculated at checkout" : summary.shipping ? formatMoney(summary.shipping, config.commerce.currency) : "Free"}</strong></div></div><div className="summary-total"><span>Estimated total</span><strong>{formatMoney(summary.total, config.commerce.currency)}</strong></div><p className="secure-note">Secure PayPal checkout. {config.announcement.text}</p></aside></div></div>;
}
