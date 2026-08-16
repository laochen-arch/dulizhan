"use client";

import { type FormEvent, useState } from "react";
import { showToast } from "./toast";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      showToast("Enter a valid email address.", "error");
      return;
    }
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "homepage" }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to subscribe right now.");
      setSubscribed(true); showToast("You are on the list.");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to subscribe right now."; setError(message); showToast(message, "error"); }
    finally { setBusy(false); }
  }

  return subscribed ? <p className="newsletter-success" role="status">You&apos;re on the list - see you out there.</p> : <form className="newsletter-form" onSubmit={submit} noValidate><label className="sr-only" htmlFor="home-email">Email address</label><input id="home-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="Your email address" required aria-invalid={Boolean(error)} aria-describedby={error ? "home-email-error" : undefined} /><button type="submit" disabled={busy}>{busy ? "Joining..." : <>Subscribe <span>-&gt;</span></>}</button>{error && <p className="form-error" id="home-email-error" role="alert">{error}</p>}</form>;
}
