"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { showToast } from "./toast";
import { trackAnalytics } from "./analytics-tracker";

export type CheckoutValues = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  deliveryMethod: string;
  couponCode: string;
};

export type CheckoutQuote = {
  currency: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponCode: string | null;
  couponApplied: boolean;
  freeShippingThreshold: number;
};

type CheckoutErrors = Partial<Record<keyof CheckoutValues, string>>;
const initialValues: CheckoutValues = { email: "", firstName: "", lastName: "", address: "", city: "", region: "", zip: "", country: "United States", deliveryMethod: "Standard delivery", couponCode: "" };

export function CheckoutForm({ onComplete, onQuoteChange }: { onComplete: () => void; onQuoteChange?: (quote: CheckoutQuote | null) => void }) {
  const { config, activeSiteId, site } = useSiteRuntime();
  const { cart } = useStore(site?.id || activeSiteId);
  const [values, setValues] = useState<CheckoutValues>(initialValues);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/account/session", { cache: "no-store" });
        const session = await sessionResponse.json().catch(() => ({})) as { access?: { authenticated?: boolean } };
        if (!session.access?.authenticated) return;
        const [profileResponse, addressResponse] = await Promise.all([fetch("/api/account/profile", { cache: "no-store" }), fetch("/api/account/addresses", { cache: "no-store" })]);
        const profile = await profileResponse.json().catch(() => ({})) as { profile?: { email?: string } };
        const addressPayload = await addressResponse.json().catch(() => ({})) as { addresses?: Array<Partial<CheckoutValues> & { isDefault?: boolean }> };
        const address = addressPayload.addresses?.find((item) => item.isDefault) || addressPayload.addresses?.[0];
        if (!active) return;
        setValues((current) => ({
          ...current,
          email: current.email || profile.profile?.email || "",
          firstName: current.firstName || address?.firstName || "",
          lastName: current.lastName || address?.lastName || "",
          address: current.address || address?.address || "",
          city: current.city || address?.city || "",
          region: current.region || address?.region || "",
          zip: current.zip || address?.zip || "",
          country: current.country === initialValues.country && address?.country ? address.country : current.country,
        }));
      } catch {
        // Checkout remains usable as a guest if the optional account prefill is unavailable.
      }
    })();
    return () => { active = false; };
  }, [activeSiteId]);

  const quoteItems = cart.map((item) => ({ productId: item.id, variantId: item.variantId, quantity: item.quantity }));
  const quoteKey = JSON.stringify({ items: quoteItems, deliveryMethod: values.deliveryMethod, couponCode: values.couponCode });
  // The quote effect reconciles local form state with the server-side total.
  useEffect(() => {
    if (!cart.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null);
      onQuoteChange?.(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setQuotePending(true); setQuoteError(""); setQuote(null); onQuoteChange?.(null);
      void fetch("/api/checkout/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: quoteItems, deliveryMethod: values.deliveryMethod, couponCode: values.couponCode }) }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { quote?: CheckoutQuote; error?: string };
        if (!response.ok || !payload.quote) throw new Error(payload.error || "Unable to calculate your total.");
        if (active) { setQuote(payload.quote); onQuoteChange?.(payload.quote); }
      }).catch((error) => {
        if (active) { setQuoteError(error instanceof Error ? error.message : "Unable to calculate your total."); onQuoteChange?.(null); }
      }).finally(() => { if (active) setQuotePending(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
    // quoteKey captures the exact cart and promotion input for this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, onQuoteChange]);

  function update(field: keyof CheckoutValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const nextErrors: CheckoutErrors = {};
    const required: Array<keyof CheckoutValues> = ["firstName", "lastName", "address", "city", "region", "zip"];
    required.forEach((field) => { if (!values[field].trim()) nextErrors[field] = "This field is required."; });
    if (!values.email.trim()) nextErrors.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(values.email)) nextErrors.email = "Enter a valid email address.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) { showToast("Check the highlighted fields before continuing.", "error"); return; }
    if (quotePending || !quote) { showToast("Updating your order total. Try again in a moment.", "error"); return; }
    setSubmitting(true); setServerError(""); idempotencyKey.current ||= crypto.randomUUID();
    showToast("Preparing secure checkout...", "info");
    trackAnalytics("checkout_started", { payload: { itemCount: cart.length, total: quote.total } });
    void fetch("/api/checkout/abandon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.email, cart, subtotal: quote.subtotal, currency: config.commerce.currency }) }).catch(() => undefined);
    void fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", "x-idempotency-key": idempotencyKey.current || "" }, body: JSON.stringify({ ...values, items: quoteItems }) }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "Unable to start payment.");
      onComplete(); window.location.assign(payload.checkoutUrl);
    }).catch((error) => { setSubmitting(false); const message = error instanceof Error ? error.message : "Unable to start payment."; setServerError(message); showToast(message, "error"); });
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    <div className="checkout-heading"><p className="eyebrow">{config.brand.name} / Checkout</p><h1>Let&apos;s get you<br /><em>on your way.</em></h1><p>Secure payment is handled by PayPal. Your payment details never touch this storefront.</p></div>
    {serverError && <div className="form-error" role="alert">{serverError}<button type="button" className="text-button" onClick={() => setServerError("")}>Dismiss</button></div>}
    <fieldset><legend>Contact</legend><Field id="checkout-email" label="Email address" value={values.email} error={errors.email} type="email" placeholder="you@example.com" onChange={(value) => update("email", value)} /><label className="checkbox-label"><input type="checkbox" /> Email me with field notes and new gear</label></fieldset>
    <fieldset><legend>Delivery</legend><div className="form-two"><Field id="checkout-first-name" label="First name" value={values.firstName} error={errors.firstName} placeholder="First name" onChange={(value) => update("firstName", value)} /><Field id="checkout-last-name" label="Last name" value={values.lastName} error={errors.lastName} placeholder="Last name" onChange={(value) => update("lastName", value)} /></div><Field id="checkout-address" label="Address" value={values.address} error={errors.address} placeholder="Street address" onChange={(value) => update("address", value)} /><div className="form-three"><Field id="checkout-city" label="City" value={values.city} error={errors.city} placeholder="City" onChange={(value) => update("city", value)} /><Field id="checkout-region" label="State / region" value={values.region} error={errors.region} placeholder="State" onChange={(value) => update("region", value)} /><Field id="checkout-zip" label="ZIP code" value={values.zip} error={errors.zip} placeholder="ZIP" onChange={(value) => update("zip", value)} /></div><SelectField id="checkout-country" label="Country" value={values.country} options={["United States", "Canada", "United Kingdom", "Australia"]} onChange={(value) => update("country", value)} /><SelectField id="checkout-delivery" label="Delivery method" value={values.deliveryMethod} options={["Standard delivery", "Express delivery"]} onChange={(value) => update("deliveryMethod", value)} /><Field id="checkout-coupon" label="Coupon code (optional)" value={values.couponCode} placeholder="WELCOME10" onChange={(value) => update("couponCode", value.toUpperCase())} />{quotePending && <p className="quote-status" role="status">Updating your order total...</p>}{quoteError && <p className="quote-status is-error" role="alert">{quoteError}</p>}{quote && values.couponCode && <p className={`quote-status ${quote.couponApplied ? "is-success" : "is-error"}`}>{quote.couponApplied ? `Coupon ${quote.couponCode} applied.` : "That coupon is not valid for this order."}</p>}{quote && quote.freeShippingThreshold > 0 && <p className="quote-status">{quote.shipping === 0 ? "Free shipping unlocked." : `Add ${formatMoney(quote.freeShippingThreshold - quote.subtotal + quote.discount, config.commerce.currency)} more to unlock free shipping.`}</p>}</fieldset>
    <fieldset><legend>Payment</legend><div className="payment-placeholder"><span>PayPal secure checkout</span><p>You&apos;ll be redirected to PayPal to approve the payment.</p></div></fieldset>
    <button className="button button-dark button-wide" type="submit" disabled={submitting || quotePending}>{submitting ? "Preparing secure checkout..." : quotePending ? "Updating total..." : "Continue to PayPal ->"}</button>
  </form>;
}

function Field({ id, label, value, error, placeholder, type = "text", onChange }: { id: string; label: string; value: string; error?: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return <label className={`checkout-field ${error ? "has-error" : ""}`} htmlFor={id}>{label}<input id={id} type={type} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</label>;
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="checkout-field" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, value));
}
