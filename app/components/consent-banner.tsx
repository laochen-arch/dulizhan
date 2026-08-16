"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "northline-consent-v28";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setVisible(!window.localStorage.getItem(CONSENT_KEY)), 0); return () => window.clearTimeout(timer); }, []);
  if (!visible) return null;
  function choose(value: "analytics" | "essential") {
    window.localStorage.setItem(CONSENT_KEY, value);
    window.dispatchEvent(new CustomEvent("northline-consent", { detail: value }));
    setVisible(false);
  }
  return <aside className="consent-banner" role="dialog" aria-labelledby="consent-title"><div><p className="eyebrow" id="consent-title">Your privacy</p><p>We use essential storage for your bag and, with your permission, anonymous analytics to improve the storefront.</p></div><div className="consent-actions"><button type="button" className="button button-outline" onClick={() => choose("essential")}>Essential only</button><button type="button" className="button button-dark" onClick={() => choose("analytics")}>Allow analytics</button></div></aside>;
}
