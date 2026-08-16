"use client";

import { useEffect, useState } from "react";
import { useSiteRuntime } from "./site-runtime";

export function TrackingScripts() {
  const { config } = useSiteRuntime();
  const [consent, setConsent] = useState<"analytics" | "essential" | "">("");
  useEffect(() => {
    const readConsent = () => setConsent((window.localStorage.getItem("northline-consent-v28") as "analytics" | "essential" | null) || "");
    readConsent();
    const onConsent = (event: Event) => setConsent((event as CustomEvent<"analytics" | "essential">).detail);
    window.addEventListener("northline-consent", onConsent);
    return () => window.removeEventListener("northline-consent", onConsent);
  }, []);
  useEffect(() => {
    if (consent !== "analytics") return;
    const tracking = (config as typeof config & { tracking?: { ga4MeasurementId?: string; metaPixelId?: string; tiktokPixelId?: string } }).tracking || {};
    const append = (id: string, src: string) => { if (!id || document.getElementById(id)) return; const script = document.createElement("script"); script.id = id; script.async = true; script.src = src; document.head.appendChild(script); };
    if (tracking.ga4MeasurementId) append("tenant-ga4", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tracking.ga4MeasurementId)}`);
    if (tracking.metaPixelId) append("tenant-meta-pixel", `https://connect.facebook.net/en_US/fbevents.js`);
    if (tracking.tiktokPixelId) append("tenant-tiktok-pixel", `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(tracking.tiktokPixelId)}&lib=ttq`);
  }, [config, consent]);
  return null;
}
