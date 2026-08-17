"use client";

import { FormEvent, useState } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const token = new URLSearchParams(window.location.search).get("token") || ""; try { const response = await fetch("/api/auth/email/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }); const payload = await response.json().catch(() => ({})) as { message?: string; error?: string }; if (!response.ok) throw new Error(payload.error || "Unable to reset password."); setMessage(payload.message || "Password updated."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reset password."); } finally { setBusy(false); } }
  return <main className="email-auth-shell"><section className="email-auth-card"><a className="email-auth-brand" href="/platform"><span>N</span><strong>Northline Commerce</strong></a><p className="eyebrow">Account security</p><h1>Set a new password.</h1>{error && <div className="client-notice error">{error}</div>}{message && <div className="client-notice success">{message} <a href="/auth/login">Sign in →</a></div>}<form className="email-auth-form" onSubmit={submit}><label><span>New password</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : "Update password →"}</button></form></section></main>;
}
