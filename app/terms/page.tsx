"use client";

import { useSiteRuntime } from "../components/site-runtime";

export default function TermsPage() {
  const { config } = useSiteRuntime();
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / Terms</p><h1>Simple terms<br /><em>for the long way.</em></h1><p>These storefront terms explain the basics of buying from us and using the site.</p></div><div className="policy-copy"><section><h2>Orders and payment</h2><p>Prices and availability are shown at checkout. An order is accepted when payment is confirmed and we send an order confirmation. PayPal handles payment authorization.</p></section><section><h2>Delivery and returns</h2><p>Delivery estimates and return guidance are described in our <a href="/shipping">shipping and returns policy</a>. We will communicate material changes to an order as soon as possible.</p></section><section><h2>Site use</h2><p>Please use the site lawfully and do not attempt to interfere with its availability, security or checkout process. Product copy and imagery are provided for the storefront experience and may change as the catalog evolves.</p></section></div></div>;
}
