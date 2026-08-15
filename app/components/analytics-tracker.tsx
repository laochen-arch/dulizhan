"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function trackAnalytics(eventType: string, data: Record<string, unknown> = {}) {
  try {
    const sessionId = sessionStorage.getItem("storefront-analytics-session") || undefined;
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType, sessionId, ...data }) }).catch(() => undefined);
  } catch { /* Analytics must never block commerce actions. */ }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const sessionKey = "storefront-analytics-session";
    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(sessionKey, sessionId); }
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "page_view", sessionId, payload: { path: pathname } }) }).catch(() => undefined);
  }, [pathname]);
  return null;
}
