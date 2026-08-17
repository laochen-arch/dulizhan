"use client";

import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [message, setMessage] = useState("正在验证邮箱...");
  useEffect(() => { const token = new URLSearchParams(window.location.search).get("token") || ""; void fetch(`/api/auth/email/verify?token=${encodeURIComponent(token)}`).then((response) => response.json()).then((payload: { message?: string; error?: string }) => setMessage(payload.message || payload.error || "验证完成。")); }, []);
  return <main className="email-auth-shell"><section className="email-auth-card"><a className="email-auth-brand" href="/platform"><span>N</span><strong>Northline Commerce</strong></a><p className="eyebrow">Email verification</p><h1>{message}</h1><a className="button button-dark" href="/platform">Return to platform →</a></section></main>;
}
