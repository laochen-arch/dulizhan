"use client";

import { useState } from "react";

export function PlatformApplicationForm() {
  const [form, setForm] = useState({ email: "", contactName: "", companyName: "", brandName: "", category: "", website: "", targetDomain: "", markets: "North America, Europe", productSource: "Own products", notes: "" });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/platform/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as { application?: { id: string }; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to submit the application.");
      setNotice({ tone: "success", text: `Application submitted. Reference: ${payload.application.id}` });
      setForm((current) => ({ ...current, notes: "" }));
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to submit the application." }); }
    finally { setBusy(false); }
  }
  return <form className="platform-application-form" onSubmit={submit}><div className="v6-form-grid"><label className="v6-field"><span>Email</span><input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="owner@company.com" /></label><label className="v6-field"><span>Contact name</span><input required value={form.contactName} onChange={(event) => update("contactName", event.target.value)} /></label><label className="v6-field"><span>Company name</span><input required value={form.companyName} onChange={(event) => update("companyName", event.target.value)} /></label><label className="v6-field"><span>Brand name</span><input required value={form.brandName} onChange={(event) => update("brandName", event.target.value)} /></label><label className="v6-field"><span>Product category</span><input required value={form.category} onChange={(event) => update("category", event.target.value)} placeholder="Outdoor gear" /></label><label className="v6-field"><span>Existing website</span><input type="url" value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="https://" /></label><label className="v6-field"><span>Target storefront domain</span><input value={form.targetDomain} onChange={(event) => update("targetDomain", event.target.value)} placeholder="shop.example.com" /></label><label className="v6-field"><span>Target markets</span><input value={form.markets} onChange={(event) => update("markets", event.target.value)} /></label><label className="v6-field"><span>Product source</span><select value={form.productSource} onChange={(event) => update("productSource", event.target.value)}><option>Own products</option><option>Wholesale catalog</option><option>Print on demand</option><option>Still selecting products</option></select></label></div><label className="v6-field"><span>What should we know?</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="SKU count, launch date, fulfillment model, special requirements..." /></label>{notice && <div className={`client-notice ${notice.tone}`} role="status">{notice.text}</div>}<button className="button button-dark" disabled={busy}>{busy ? "Submitting..." : "Submit merchant application →"}</button></form>;
}
