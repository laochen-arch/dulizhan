"use client";

import { FormEvent, useEffect, useState } from "react";

export default function UnsubscribePage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Enter your email address to stop marketing emails.");
  const [busy, setBusy] = useState(false);

  async function unsubscribe(input: { token?: string; email?: string }) {
    setBusy(true);
    const response = await fetch("/api/newsletter", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const payload = await response.json().catch(() => ({})) as { unsubscribed?: boolean; error?: string };
    setBusy(false);
    setMessage(response.ok ? "You have been unsubscribed from marketing emails." : payload.error || "We could not update your preference.");
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    void fetch("/api/newsletter", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as { error?: string } }))
      .then(({ response, payload }) => setMessage(response.ok ? "You have been unsubscribed from marketing emails." : payload.error || "We could not update your preference."));
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void unsubscribe({ email });
  }

  return <main className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">Email preferences</p><h1>Choose what<br /><em>reaches you.</em></h1><p role="status">{busy ? "Updating your preference…" : message}</p></div><form className="newsletter-form" onSubmit={submit}><label className="sr-only" htmlFor="unsubscribe-email">Email address</label><input id="unsubscribe-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button type="submit" disabled={busy}>{busy ? "Updating…" : "Unsubscribe"}</button></form></main>;
}
