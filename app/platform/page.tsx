import Link from "../components/site-link";

export const metadata = { title: "Northline Commerce for merchants" };

const platformFeatures = [
  { index: "01", title: "White-label by default", body: "Start from a proven storefront system, then replace the identity, content, catalog and policies with your own materials." },
  { index: "02", title: "A real merchant workspace", body: "Operate products, stock, campaigns, orders and after-sales without mixing your catalog with platform templates." },
  { index: "03", title: "Launch with guardrails", body: "Payments, email, domains, release checks and tenant permissions are visible before the first customer order." },
];

const deliverySteps = [
  { index: "01", title: "Apply", body: "Share your company, brand, product category, markets and desired domain." },
  { index: "02", title: "Prepare", body: "Choose a template, prefill the brand direction and upload the first product materials." },
  { index: "03", title: "Review", body: "The platform team checks the application, creates an isolated storefront and assigns your merchant owner." },
  { index: "04", title: "Operate", body: "Move into the merchant workspace to publish products, connect operations and take the first order." },
];

const platformCases = [
  { index: "01", label: "Outdoor / direct-to-consumer", title: "A field-ready catalog without a platform rebuild.", body: "A focused gear brand starts from the commerce template, replaces the identity and launches a six-product collection with its own fulfillment workspace." },
  { index: "02", label: "Travel / modular systems", title: "One delivery playbook for a growing assortment.", body: "A travel accessories team uses the same storefront foundation while keeping products, prices, stock and campaign decisions inside its own tenant." },
  { index: "03", label: "Creator / limited drops", title: "A launch path that stays reviewable.", body: "A creator-led brand submits a launch plan, shares a small catalog, reviews the draft and receives a clear handoff into merchant operations." },
];

export default function PlatformPortalPage() {
  return <main className="platform-portal">
    <section className="platform-hero"><div className="platform-hero-copy"><p className="eyebrow">Northline Commerce / Merchant platform</p><h1>Launch your storefront<br /><em>without rebuilding the stack.</em></h1><p>Northline gives growing brands a white-label storefront, a clean merchant workspace and the operational controls needed to sell with confidence.</p><div className="platform-actions"><Link className="button button-dark" href="/platform/apply">Apply to join →</Link><Link className="button button-outline" href="/platform/applications">Open launch workspace</Link></div><div className="platform-hero-proof"><span><strong>4</strong><small>clear business entrances</small></span><span><strong>1</strong><small>isolated storefront per merchant</small></span><span><strong>0</strong><small>platform catalog overlap</small></span></div></div><div className="platform-hero-panel"><span className="platform-panel-kicker">One platform / four clear roles</span><strong>Platform operators set the guardrails.</strong><strong>Merchants sell and operate.</strong><strong>Consumers browse and buy.</strong><small>Each storefront keeps its own catalog, orders, inventory, credentials and team access.</small><Link className="text-link platform-panel-link" href="/platform/templates/default">Preview the starter storefront →</Link></div></section>
    <section className="platform-section platform-features"><div className="platform-section-intro"><p className="eyebrow">Built for delivery teams</p><h2>One repeatable system<br /><em>for every new brand.</em></h2><p>Use the same delivery discipline for each client while keeping the customer-facing storefront distinctly theirs.</p></div><div className="platform-feature-list">{platformFeatures.map((feature) => <article key={feature.index}><span>{feature.index}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div></section>
    <section className="platform-section platform-delivery"><div><p className="eyebrow">Merchant delivery path</p><h2>From application<br /><em>to first order.</em></h2></div><div className="platform-step-grid">{deliverySteps.map((step) => <article key={step.index}><span>{step.index}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div></section>
    <section className="platform-section platform-cases"><div className="platform-section-intro"><p className="eyebrow">Customer cases / examples</p><h2>Launch patterns<br /><em>already mapped.</em></h2><p>Representative delivery examples show how the same platform foundation adapts to different merchant models. Replace these examples with verified customer stories as they become available.</p></div><div className="platform-case-grid">{platformCases.map((item) => <article key={item.index}><span>{item.index}</span><p className="eyebrow">{item.label}</p><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
    <section className="platform-template-strip"><div><p className="eyebrow">Public template preview</p><h2>See the starting point before you apply.</h2><p>Templates are a delivery accelerator, not a shared product catalog. Your approved site gets its own copy that your merchant team can change independently.</p></div><Link className="button button-outline" href="/platform/templates/default">View template ↗</Link></section>
    <section className="platform-boundary"><p className="eyebrow">Clear responsibility</p><h2>Platform templates are not merchant inventory.</h2><p>The platform team controls onboarding, tenant delivery, domains, integrations, approvals and support. Your merchant team controls the actual products, prices, stock, promotions, orders and customer service inside the assigned storefront.</p><div className="platform-boundary-grid"><span><strong>Platform</strong><small>Onboarding · templates · domains · release health</small></span><span><strong>Merchant</strong><small>Products · inventory · campaigns · fulfillment</small></span><span><strong>Consumer</strong><small>Account · address · cart · orders · after-sales</small></span></div></section>
  </main>;
}
