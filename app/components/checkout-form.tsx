"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useStore } from "./cart-store";
import { showToast } from "./toast";

type CheckoutValues = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  deliveryMethod: string;
};

type CheckoutErrors = Partial<Record<keyof CheckoutValues, string>>;

const initialValues: CheckoutValues = { email: "", firstName: "", lastName: "", address: "", city: "", region: "", zip: "", country: "United States", deliveryMethod: "Standard delivery" };

export function CheckoutForm({ onComplete }: { onComplete: () => void }) {
  const { cart } = useStore();
  const [values, setValues] = useState<CheckoutValues>(initialValues);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

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
    if (!validate()) {
      showToast("Check the highlighted fields before continuing.", "error");
      return;
    }
    setSubmitting(true);
    setServerError("");
    showToast("Preparing secure checkout...", "info");
    void fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, items: cart.map((item) => ({ productId: item.id, variantId: item.variantId, quantity: item.quantity })) }) }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: string; code?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "Unable to start payment.");
      onComplete();
      window.location.assign(payload.checkoutUrl);
    }).catch((error) => {
      setSubmitting(false);
      const message = error instanceof Error ? error.message : "Unable to start payment.";
      setServerError(message);
      showToast(message, "error");
    });
  }

  return <form className="checkout-form" onSubmit={submit} noValidate><div className="checkout-heading"><p className="eyebrow">Northline / Checkout</p><h1>Let&apos;s get you<br /><em>on your way.</em></h1><p>Secure payment is handled by PayPal. Your payment details never touch this storefront.</p></div>{serverError && <div className="form-error" role="alert">{serverError}<button type="button" className="text-button" onClick={() => setServerError("")}>Dismiss</button></div>}<fieldset><legend>Contact</legend><Field id="checkout-email" label="Email address" value={values.email} error={errors.email} type="email" placeholder="you@example.com" onChange={(value) => update("email", value)} /><label className="checkbox-label"><input type="checkbox" /> Email me with field notes and new gear</label></fieldset><fieldset><legend>Delivery</legend><div className="form-two"><Field id="checkout-first-name" label="First name" value={values.firstName} error={errors.firstName} placeholder="First name" onChange={(value) => update("firstName", value)} /><Field id="checkout-last-name" label="Last name" value={values.lastName} error={errors.lastName} placeholder="Last name" onChange={(value) => update("lastName", value)} /></div><Field id="checkout-address" label="Address" value={values.address} error={errors.address} placeholder="Street address" onChange={(value) => update("address", value)} /><div className="form-three"><Field id="checkout-city" label="City" value={values.city} error={errors.city} placeholder="City" onChange={(value) => update("city", value)} /><Field id="checkout-region" label="State / region" value={values.region} error={errors.region} placeholder="State" onChange={(value) => update("region", value)} /><Field id="checkout-zip" label="ZIP code" value={values.zip} error={errors.zip} placeholder="ZIP" onChange={(value) => update("zip", value)} /></div><SelectField id="checkout-country" label="Country" value={values.country} options={["United States", "Canada", "United Kingdom", "Australia"]} onChange={(value) => update("country", value)} /><SelectField id="checkout-delivery" label="Delivery method" value={values.deliveryMethod} options={["Standard delivery", "Express delivery"]} onChange={(value) => update("deliveryMethod", value)} /></fieldset><fieldset><legend>Payment</legend><div className="payment-placeholder"><span>PayPal secure checkout</span><p>You&apos;ll be redirected to PayPal to approve the payment.</p></div></fieldset><button className="button button-dark button-wide" type="submit" disabled={submitting}>{submitting ? "Preparing secure checkout..." : "Continue to PayPal ->"}</button></form>;
}

function Field({ id, label, value, error, placeholder, type = "text", onChange }: { id: string; label: string; value: string; error?: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return <label className={`checkout-field ${error ? "has-error" : ""}`} htmlFor={id}>{label}<input id={id} type={type} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</label>;
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="checkout-field" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
