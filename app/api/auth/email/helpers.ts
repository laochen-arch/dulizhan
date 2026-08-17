import { env } from "cloudflare:workers";
import { consumeEmailAuthRateLimit } from "../../../../db/email-auth";

export function sessionCookie(value: string, maxAge = 60 * 60 * 24 * 30) {
  return `northline_email_session=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

export function clearedSessionCookie() {
  return "northline_email_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure";
}

function clientAddress(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0];
  return (forwarded || request.headers.get("x-real-ip") || "unknown").trim().slice(0, 120);
}

export async function authRateLimit(request: Request, scope: string, subject = "", limit = 10, windowMs = 15 * 60 * 1000) {
  const address = clientAddress(request);
  const normalizedSubject = subject.trim().toLowerCase().slice(0, 160) || "anonymous";
  const [ipResult, subjectResult] = await Promise.all([
    consumeEmailAuthRateLimit(`${scope}:ip`, address, limit, windowMs),
    consumeEmailAuthRateLimit(`${scope}:subject`, `${address}:${normalizedSubject}`, limit, windowMs),
  ]);
  const blocked = [ipResult, subjectResult].find((result) => !result.allowed);
  if (!blocked) return null;
  return Response.json({ error: "请求过于频繁，请稍后重试。", code: "RATE_LIMITED", retryAfterSeconds: blocked.retryAfterSeconds }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(blocked.retryAfterSeconds) } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function sendAuthEmail(input: { request: Request; to: string; kind: "verify" | "reset"; token: string }) {
  const bindings = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string };
  if (!bindings.RESEND_API_KEY || !bindings.RESEND_FROM_EMAIL) return false;
  const path = input.kind === "verify" ? "/auth/verify" : "/auth/reset";
  const link = new URL(`${path}?token=${encodeURIComponent(input.token)}`, input.request.url).toString();
  const subject = input.kind === "verify" ? "Verify your Northline Commerce email" : "Reset your Northline Commerce password";
  const title = input.kind === "verify" ? "Verify your email" : "Reset your password";
  const safeLink = escapeHtml(link);
  const body = JSON.stringify({ from: bindings.RESEND_FROM_EMAIL, to: [input.to], subject, html: `<p>${title}</p><p><a href="${safeLink}">${safeLink}</a></p><p>This link expires soon. If you did not request it, you can ignore this email.</p>` });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${bindings.RESEND_API_KEY}`, "Content-Type": "application/json" }, body, signal: controller.signal });
      if (response.ok) return true;
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) return false;
    } catch {
      // Retry transient network failures once; account creation remains independent from email delivery.
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (attempt === 0) await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }
  return false;
}

export function safeReturnTo(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/platform"; }
