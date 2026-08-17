"use client";

import { useState } from "react";
import Link from "../../components/site-link";
import { formatPlanMoney, platformPlans } from "../platform-plans";

export default function PlatformPlansPage() {
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  return <main className="platform-pricing-page">
    <div className="platform-pricing-hero"><p className="eyebrow">Northline Commerce / Platform plans</p><h1>Choose the right<br /><em>launch track.</em></h1><p>Start with a reusable storefront foundation, then scale the catalog and support layer as your operation grows.</p><div className="platform-pricing-toggle" aria-label="Billing interval"><button type="button" className={interval === "annual" ? "is-active" : ""} onClick={() => setInterval("annual")}>Annual <b>Save 20%</b></button><button type="button" className={interval === "monthly" ? "is-active" : ""} onClick={() => setInterval("monthly")}>Monthly</button></div></div>
    <section className="platform-plan-grid" aria-label="Platform plans">{platformPlans.map((plan, index) => { const price = interval === "annual" ? plan.annualFee : plan.monthlyFee; return <article className={index === 1 ? "is-featured" : ""} key={plan.id}><div className="platform-plan-top"><p className="eyebrow">{index === 1 ? "Most popular" : `Track 0${index + 1}`}</p><h2>{plan.name}</h2><p>{plan.description}</p></div><div className="platform-plan-price"><strong>{formatPlanMoney(price, plan.currency)}</strong><span>/ {interval === "annual" ? "year" : "month"}</span></div><small>{interval === "annual" ? `Equivalent to ${formatPlanMoney(Math.round(plan.annualFee / 12), plan.currency)} / month` : `Annual billing ${formatPlanMoney(plan.annualFee, plan.currency)}`} · Setup {formatPlanMoney(plan.setupFee, plan.currency)}</small><Link className="button button-dark" href={`/platform/apply?plan=${encodeURIComponent(plan.id)}`}>Start with {plan.name} →</Link><div className="platform-plan-fees"><strong>Service fee</strong><span>{plan.serviceFeePercent}% of platform-processed sales</span></div><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul></article>; })}</section>
    <section className="platform-pricing-explain"><div><p className="eyebrow">Clear commercial boundaries</p><h2>One setup fee.<br /><em>Predictable operating cost.</em></h2></div><div><p>Setup covers the first storefront configuration and launch handoff. The recurring platform fee covers the workspace, delivery tooling and support path. The service fee is kept separate so you can distinguish platform operations from payment-provider charges.</p><Link className="text-link" href="/platform/agreement">Read the platform agreement →</Link></div></section>
  </main>;
}
