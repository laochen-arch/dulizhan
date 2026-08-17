import { env } from "cloudflare:workers";

export function sessionCookie(value: string, maxAge = 60 * 60 * 24 * 30) {
  return `northline_email_session=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

export async function sendAuthEmail(input: { request: Request; to: string; kind: "verify" | "reset"; token: string }) {
  const bindings = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string };
  if (!bindings.RESEND_API_KEY || !bindings.RESEND_FROM_EMAIL) return false;
  const path = input.kind === "verify" ? "/auth/verify" : "/auth/reset";
  const link = new URL(`${path}?token=${encodeURIComponent(input.token)}`, input.request.url).toString();
  const subject = input.kind === "verify" ? "Verify your Northline Commerce email" : "Reset your Northline Commerce password";
  const title = input.kind === "verify" ? "Verify your email" : "Reset your password";
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${bindings.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: bindings.RESEND_FROM_EMAIL, to: [input.to], subject, html: `<p>${title}</p><p><a href="${link}">${link}</a></p><p>This link expires soon. If you did not request it, you can ignore this email.</p>` }) });
  return response.ok;
}

export function safeReturnTo(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/platform"; }
