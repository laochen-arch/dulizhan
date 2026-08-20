"use client";

import { FormEvent, useMemo, useState } from "react";

export function EmailAuthPage({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const returnTo = useMemo(() => { const value = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("return_to"); return value && value.startsWith("/") && !value.startsWith("//") ? value : "/platform"; }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setNeedsVerification(false);
    try {
      const response = await fetch(`/api/auth/email/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; verificationSent?: boolean };
      if (!response.ok) { if (payload.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true); throw new Error(payload.error || "Unable to continue."); }
      if (mode === "register") { setMessage(payload.verificationSent ? "账号已创建，请先验证邮箱，再返回登录。" : "账号已创建，但验证邮件服务暂未配置，请联系平台管理员。"); }
      else window.location.assign(returnTo);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to continue."); }
    finally { setBusy(false); }
  }

  async function resendVerification() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setMessage(payload.message || "如果账号需要验证，新的验证邮件已发送。");
    } catch { setError("暂时无法发送验证邮件，请稍后重试。"); }
    finally { setBusy(false); }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch("/api/auth/email/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const payload = await response.json().catch(() => ({})) as { message?: string }; setMessage(payload.message || "如果邮箱已注册，密码重置链接会发送到邮箱。"); } catch { setError("暂时无法发送重置请求。"); } finally { setBusy(false); }
  }

  return <main className="email-auth-shell"><section className="email-auth-card"><a className="email-auth-brand" href="/platform"><span>N</span><strong>Northline Commerce</strong></a><p className="eyebrow">{mode === "login" ? "Welcome back" : "Merchant platform"}</p><h1>{mode === "login" ? "Sign in to continue." : "Create your platform account."}</h1><p className="email-auth-intro">Use one email account for the platform portal, merchant workspace and storefront account.</p>{error && <div className="client-notice error" role="alert">{error}</div>}{message && <div className="client-notice success" role="status">{message}</div>}{needsVerification && <button type="button" className="button button-outline" onClick={() => void resendVerification()} disabled={busy}>{busy ? "Sending..." : "Resend verification email →"}</button>}{forgot ? <form className="email-auth-form" onSubmit={requestReset}><label><span>Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="button button-dark" disabled={busy}>{busy ? "Sending..." : "Send reset link →"}</button><button type="button" className="text-button" onClick={() => setForgot(false)}>Back to sign in</button></form> : <form className="email-auth-form" onSubmit={submit}>{mode === "register" && <label><span>Name or brand owner</span><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}<label><span>Email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Password</span><input required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /><small>At least 8 characters.</small></label><button className="button button-dark" disabled={busy}>{busy ? "Working..." : mode === "login" ? "Sign in →" : "Create account →"}</button>{mode === "login" && <button type="button" className="text-button" onClick={() => setForgot(true)}>Forgot password?</button>}</form>}<div className="email-auth-footer">{mode === "login" ? <>New here? <a href={`/auth/register?return_to=${encodeURIComponent(returnTo)}`}>Create an account</a></> : <>Already registered? <a href={`/auth/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</a></>}<span>·</span><a href="/platform">Back to platform</a></div></section></main>;
}
