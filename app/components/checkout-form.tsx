"use client";

import type { FormEvent } from "react";
import { useState } from "react";
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
  const [values, setValues] = useState<CheckoutValues>(initialValues);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitting, setSubmitting] = useState(false);

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
    showToast("Preparing your demo order...", "info");
    window.setTimeout(() => onComplete(), 650);
  }

  return <form className="checkout-form" onSubmit={submit} noValidate><div className="checkout-heading"><p className="eyebrow">Northline / Checkout</p><h1>Let&apos;s get you<br /><em>on your way.</em></h1><p>This is a demo checkout. No payment will be processed.</p></div><fieldset><legend>Contact</legend><Field id="checkout-email" label="Email address" value={values.email} error={errors.email} type="email" placeholder="you@example.com" onChange={(value) => update("email", value)} /><label className="checkbox-label"><input type="checkbox" /> Email me with field notes and new gear</label></fieldset><fieldset><legend>Delivery</legend><div className="form-two"><Field id="checkout-first-name" label="First name" value={values.firstName} error={errors.firstName} placeholder="First name" onChange={(value) => update("firstName", value)} /><Field id="checkout-last-name" label="Last name" value={values.lastName} error={errors.lastName} placeholder="Last name" onChange={(value) => update("lastName", value)} /></div><Field id="checkout-address" label="Address" value={values.address} error={errors.address} placeholder="Street address" onChange={(value) => update("address", value)} /><div className="form-three"><Field id="checkout-city" label="City" value={values.city} error={errors.city} placeholder="City" onChange={(value) => update("city", value)} /><Field id="checkout-region" label="State / region" value={values.region} error={errors.region} placeholder="State" onChange={(value) => update("region", value)} /><Field id="checkout-zip" label="ZIP code" value={values.zip} error={errors.zip} placeholder="ZIP" onChange={(value) => update("zip", value)} /></div><SelectField id="checkout-country" label="Country" value={values.country} options={["United States", "Canada", "United Kingdom", "Australia"]} onChange={(value) => update("country", value)} /><SelectField id="checkout-delivery" label="Delivery method" value={values.deliveryMethod} options={["Standard delivery", "Express delivery"]} onChange={(value) => update("deliveryMethod", value)} /></fieldset><fieldset><legend>Payment</legend><div className="payment-placeholder"><span>Demo mode</span><p>Payment processing will be connected here.</p></div></fieldset><button className="button button-dark button-wide" type="submit" disabled={submitting}>{submitting ? "Preparing order..." : "Place demo order -&gt;"}</button></form>;
}

function Field({ id, label, value, error, placeholder, type = "text", onChange }: { id: string; label: string; value: string; error?: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return <label className={`checkout-field ${error ? "has-error" : ""}`} htmlFor={id}>{label}<input id={id} type={type} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</label>;
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="checkout-field" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
