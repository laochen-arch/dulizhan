"use client";

import { useEffect, useState } from "react";

type Center = { codes: Array<{ id: string; code: string; rewardAmount: number; status: string; createdAt: string }>; referrals: Array<{ id: string; code: string; applicationId: string; referredEmail: string; status: string; rewardAmount: number; createdAt: string }>; rewards: Array<{ id: string; referralId: string; recipientEmail: string; amount: number; currency: string; status: string; paidAt: string | null; createdAt: string }> };
const money = (value: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

export default function PlatformReferralsPage() {
  const [center, setCenter] = useState<Center | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/platform/referrals", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as Center & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Sign in to view referral rewards.");
    setCenter(payload);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load referrals.")); }, []);

  async function createCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_code" }) });
      const payload = await response.json().catch(() => ({})) as { code?: { code: string }; error?: string };
      if (!response.ok || !payload.code) throw new Error(payload.error || "Unable to create a referral link.");
      setNotice(`Referral link ready: ${window.location.origin}/platform/apply?ref=${payload.code.code}`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create a referral link."); }
    finally { setBusy(false); }
  }

  return <main className="platform-portal platform-referral-page"><section className="platform-referral-hero"><p className="eyebrow">Northline Commerce / Referral program</p><h1>Share the launch path.<br /><em>Earn when it goes live.</em></h1><p>Invite a brand to apply through your link. The reward becomes qualified after the application is approved and the storefront is created, then the platform team records the payout.</p><button type="button" className="button button-dark" onClick={() => void createCode()} disabled={busy}>{busy ? "Creating..." : "Create my referral link →"}</button>{notice && <div className="client-notice success" role="status">{notice}</div>}{error && <div className="client-notice error" role="alert">{error} <a href="/auth/login?return_to=%2Fplatform%2Freferrals">Sign in</a></div>}</section>{center && <section className="platform-referral-grid"><article><p className="eyebrow">Your links</p><h2>Active referral codes.</h2>{center.codes.length ? center.codes.map((code) => <div className="platform-referral-row" key={code.id}><strong>{code.code}</strong><span>{money(code.rewardAmount)} reward</span><small>{code.status} · {new Date(code.createdAt).toLocaleDateString()}</small></div>) : <p className="v6-muted">Create a link to start inviting merchants.</p>}</article><article><p className="eyebrow">Applications</p><h2>Referral progress.</h2>{center.referrals.length ? center.referrals.map((item) => <div className="platform-referral-row" key={item.id}><strong>{item.code}</strong><span>{item.status} · {money(item.rewardAmount)}</span><small>{item.referredEmail} · {new Date(item.createdAt).toLocaleDateString()}</small></div>) : <p className="v6-muted">No referred applications yet.</p>}</article><article><p className="eyebrow">Rewards</p><h2>Payment records.</h2>{center.rewards.length ? center.rewards.map((reward) => <div className="platform-referral-row" key={reward.id}><strong>{money(reward.amount, reward.currency)}</strong><span>{reward.status}</span><small>{reward.recipientEmail}{reward.paidAt ? ` · Paid ${new Date(reward.paidAt).toLocaleDateString()}` : ""}</small></div>) : <p className="v6-muted">Rewards appear after a referred storefront qualifies.</p>}</article></section>}</main>;
}
