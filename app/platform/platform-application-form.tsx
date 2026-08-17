"use client";

import { useMemo, useState } from "react";

type ApplicationForm = {
  applicantType: "business" | "individual";
  email: string;
  contactName: string;
  phone: string;
  companyName: string;
  brandName: string;
  category: string;
  website: string;
  targetDomain: string;
  markets: string;
  productSource: string;
  templateSiteId: string;
  brandLogoUrl: string;
  brandPrimaryColor: string;
  homeCopy: string;
  productCsv: string;
  productJson: string;
  productMode: "csv" | "json";
  agreementAccepted: boolean;
};

type Notice = { tone: "success" | "error"; text: string };

const initialForm: ApplicationForm = {
  applicantType: "business",
  email: "",
  contactName: "",
  phone: "",
  companyName: "",
  brandName: "",
  category: "",
  website: "",
  targetDomain: "",
  markets: "North America, Europe",
  productSource: "Own products",
  templateSiteId: "default",
  brandLogoUrl: "",
  brandPrimaryColor: "#1769d2",
  homeCopy: "",
  productCsv: "",
  productJson: "",
  productMode: "csv",
  agreementAccepted: false,
};

const requiredByStep: Record<number, Array<keyof ApplicationForm>> = {
  1: ["email", "contactName", "companyName", "brandName", "category"],
  2: [],
  3: [],
};

export function PlatformApplicationForm() {
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusUrl, setStatusUrl] = useState("");
  const [applicationId, setApplicationId] = useState("");

  const productCount = useMemo(() => {
    if (form.productMode === "csv") return Math.max(0, form.productCsv.split(/\r?\n/).filter((line) => line.trim()).length - 1);
    try { return Array.isArray(JSON.parse(form.productJson || "[]")) ? JSON.parse(form.productJson || "[]").length : 0; } catch { return 0; }
  }, [form.productCsv, form.productJson, form.productMode]);

  function update(field: keyof ApplicationForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value } as ApplicationForm));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validateStep(targetStep: number) {
    const nextErrors: Record<string, string> = {};
    for (const field of requiredByStep[targetStep] || []) {
      if (!String(form[field] || "").trim()) nextErrors[field] = "This field is required.";
    }
    if (targetStep === 1 && form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (targetStep === 1 && form.phone && !/^[0-9+().\-\s]{7,30}$/.test(form.phone.trim())) nextErrors.phone = "Enter a valid phone number.";
    if (targetStep === 2 && form.website && !/^https?:\/\//i.test(form.website.trim())) nextErrors.website = "Use a full URL beginning with https://.";
    if (targetStep === 2 && form.brandLogoUrl && !/^https?:\/\//i.test(form.brandLogoUrl.trim())) nextErrors.brandLogoUrl = "Use a full image URL beginning with https://.";
    if (targetStep === 2 && form.targetDomain && /:\/\//.test(form.targetDomain)) nextErrors.targetDomain = "Enter only the hostname, such as shop.example.com.";
    if (targetStep === 3 && form.productMode === "json" && form.productJson.trim()) {
      try { if (!Array.isArray(JSON.parse(form.productJson))) nextErrors.productJson = "JSON must be an array of products."; } catch { nextErrors.productJson = "JSON is not valid. Check commas and quotation marks."; }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function nextStep() {
    if (validateStep(step)) setStep((current) => Math.min(3, current + 1));
  }

  function previousStep() {
    setErrors({});
    setStep((current) => Math.max(1, current - 1));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    if (!form.agreementAccepted) { setErrors({ agreementAccepted: "Confirm the platform terms before submitting." }); return; }
    setBusy(true);
    setNotice(null);
    try {
      const productImport = form.productMode === "csv"
        ? (form.productCsv.trim() ? { productCsv: form.productCsv } : undefined)
        : (form.productJson.trim() ? { products: JSON.parse(form.productJson) } : undefined);
      const response = await fetch("/api/platform/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, productImport, productCsv: undefined, productJson: undefined, productMode: undefined, agreementVersion: "platform-v1" }) });
      const payload = await response.json().catch(() => ({})) as { application?: { id: string }; accessToken?: string; statusUrl?: string; error?: string; applicationId?: string };
      if (!response.ok || !payload.application) {
        if (payload.applicationId) setApplicationId(payload.applicationId);
        throw new Error(payload.error || "Unable to submit the application.");
      }
      setApplicationId(payload.application.id);
      setStatusUrl(payload.statusUrl || `/platform/applications?application=${encodeURIComponent(payload.application.id)}`);
      setNotice({ tone: "success", text: "Application submitted. Keep the reference and use the secure status link to continue onboarding." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to submit the application." });
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (field: string) => errors[field] ? "has-error" : "";
  const fieldError = (field: string) => errors[field] ? <small className="platform-field-error" id={`${field}-error`}>{errors[field]}</small> : null;

  return <form className="platform-application-form" onSubmit={submit} noValidate>
    <p className="platform-agreement-reference">Before submitting, review the <a href="/platform/agreement" target="_blank" rel="noreferrer">platform onboarding agreement</a>.</p>
    <div className="platform-form-progress" aria-label="Application steps">
      {["Business profile", "Storefront plan", "Launch materials"].map((label, index) => <div key={label} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong></div>)}
    </div>
    {step === 1 && <section className="platform-form-step"><div className="platform-form-step-heading"><p className="eyebrow">01 / Business profile</p><h2>Who is launching?</h2><p>We use this information to route the application and prepare the right merchant workspace.</p></div><div className="v6-form-grid"><label className="v6-field"><span>Applicant type</span><select value={form.applicantType} onChange={(event) => update("applicantType", event.target.value)}><option value="business">Business</option><option value="individual">Individual / creator</option></select></label><label className={`v6-field ${fieldClass("email")}`}><span>Email <b>*</b></span><input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="owner@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />{fieldError("email")}</label><label className={`v6-field ${fieldClass("contactName")}`}><span>Contact name <b>*</b></span><input required value={form.contactName} onChange={(event) => update("contactName", event.target.value)} aria-invalid={Boolean(errors.contactName)} />{fieldError("contactName")}</label><label className={`v6-field ${fieldClass("phone")}`}><span>Phone</span><input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+1 555 000 0000" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} />{fieldError("phone")}</label><label className={`v6-field ${fieldClass("companyName")}`}><span>Company / creator name <b>*</b></span><input required value={form.companyName} onChange={(event) => update("companyName", event.target.value)} aria-invalid={Boolean(errors.companyName)} />{fieldError("companyName")}</label><label className={`v6-field ${fieldClass("brandName")}`}><span>Brand name <b>*</b></span><input required value={form.brandName} onChange={(event) => update("brandName", event.target.value)} placeholder="Northline Supply" aria-invalid={Boolean(errors.brandName)} />{fieldError("brandName")}</label><label className={`v6-field ${fieldClass("category")}`}><span>Product category <b>*</b></span><input required value={form.category} onChange={(event) => update("category", event.target.value)} placeholder="Outdoor gear" aria-invalid={Boolean(errors.category)} />{fieldError("category")}</label><label className="v6-field"><span>Target markets</span><input value={form.markets} onChange={(event) => update("markets", event.target.value)} placeholder="North America, Europe" /></label></div></section>}
    {step === 2 && <section className="platform-form-step"><div className="platform-form-step-heading"><p className="eyebrow">02 / Storefront plan</p><h2>Shape the first draft.</h2><p>Choose a starting template and give the delivery team enough direction to prepare your white-label storefront.</p></div><div className="platform-template-choice"><label className={`platform-template-option ${form.templateSiteId === "default" ? "is-selected" : ""}`}><input type="radio" name="template" value="default" checked={form.templateSiteId === "default"} onChange={(event) => update("templateSiteId", event.target.value)} /><span><strong>Northline Commerce / Outdoor</strong><small>Editorial commerce layout with product discovery, trust content and a focused checkout path.</small></span><a href="/platform/templates/default" target="_blank" rel="noreferrer">Preview ↗</a></label></div><div className="v6-form-grid"><label className={`v6-field ${fieldClass("website")}`}><span>Existing website</span><input type="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://example.com" aria-invalid={Boolean(errors.website)} />{fieldError("website")}</label><label className={`v6-field ${fieldClass("targetDomain")}`}><span>Target storefront domain</span><input value={form.targetDomain} onChange={(event) => update("targetDomain", event.target.value)} placeholder="shop.example.com" aria-invalid={Boolean(errors.targetDomain)} />{fieldError("targetDomain")}</label><label className={`v6-field ${fieldClass("brandLogoUrl")}`}><span>Logo image URL</span><input type="url" value={form.brandLogoUrl} onChange={(event) => update("brandLogoUrl", event.target.value)} placeholder="https://cdn.example.com/logo.png" aria-invalid={Boolean(errors.brandLogoUrl)} />{fieldError("brandLogoUrl")}</label><label className="v6-field"><span>Primary brand color</span><input type="color" value={form.brandPrimaryColor} onChange={(event) => update("brandPrimaryColor", event.target.value)} /></label></div><label className="v6-field"><span>Homepage direction</span><textarea value={form.homeCopy} onChange={(event) => update("homeCopy", event.target.value)} placeholder="Describe the customer, product promise and homepage message you want to start with." /></label></section>}
    {step === 3 && <section className="platform-form-step"><div className="platform-form-step-heading"><p className="eyebrow">03 / Launch materials</p><h2>Bring the first catalog.</h2><p>CSV or JSON can be imported into the draft after approval. Images can be uploaded and bound from your application workspace.</p></div><div className="platform-import-switcher" role="tablist" aria-label="Product import format"><button type="button" className={form.productMode === "csv" ? "is-active" : ""} onClick={() => update("productMode", "csv")}>CSV</button><button type="button" className={form.productMode === "json" ? "is-active" : ""} onClick={() => update("productMode", "json")}>JSON</button></div>{form.productMode === "csv" ? <label className="v6-field"><span>Product CSV</span><textarea value={form.productCsv} onChange={(event) => update("productCsv", event.target.value)} placeholder="name,slug,sku,category,price,stock,status,image\nTrail Pack,trail-pack,TRAIL-001,Carry,148,20,active,https://..." /><small>Optional now. {productCount ? `${productCount} row(s) detected.` : "You can add it after approval."}</small></label> : <label className={`v6-field ${fieldClass("productJson")}`}><span>Product JSON</span><textarea value={form.productJson} onChange={(event) => update("productJson", event.target.value)} placeholder="[{&quot;name&quot;:&quot;Trail Pack&quot;,&quot;slug&quot;:&quot;trail-pack&quot;,&quot;sku&quot;:&quot;TRAIL-001&quot;,&quot;price&quot;:148,&quot;stock&quot;:20}]" aria-invalid={Boolean(errors.productJson)} />{fieldError("productJson")}</label>}<label className={`platform-agreement ${errors.agreementAccepted ? "has-error" : ""}`}><input type="checkbox" checked={form.agreementAccepted} onChange={(event) => update("agreementAccepted", event.target.checked)} /><span>I confirm the <a href="/terms" target="_blank" rel="noreferrer">service terms</a>, <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a> and platform onboarding agreement.<small>{errors.agreementAccepted || "Your materials remain in draft until a platform operator reviews the application."}</small></span></label></section>}
    {notice && <div className={`client-notice ${notice.tone}`} role="status">{notice.text}{applicationId && <strong> Reference: {applicationId}</strong>}{statusUrl && <a href={statusUrl}>Open application workspace →</a>}</div>}
    <div className="platform-form-actions"><button type="button" className="button button-outline" onClick={previousStep} disabled={busy || step === 1}>← Back</button>{step < 3 ? <button type="button" className="button button-dark" onClick={nextStep}>Continue →</button> : <button type="submit" className="button button-dark" disabled={busy}>{busy ? "Submitting..." : "Submit merchant application →"}</button>}</div>
  </form>;
}
