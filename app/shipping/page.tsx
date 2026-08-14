"use client";

import { useSiteRuntime } from "../components/site-runtime";

export default function ShippingPage() {
  const { config } = useSiteRuntime();
  const policies = config.content.policies;
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / Shipping & returns</p><h1>On the way<br /><em>to you.</em></h1><p>Clear delivery details, because wondering where your order is should not be part of the journey.</p></div><div className="policy-grid"><section><p className="eyebrow">Shipping</p><h2>Made to move</h2><p>{policies.shippingLead} You&apos;ll receive a tracking email as soon as your order leaves our studio.</p><div className="policy-table"><div><strong>Standard US</strong><span>3-5 business days - $8</span></div><div><strong>Free US shipping</strong><span>Orders over {policies.shippingThreshold}</span></div><div><strong>Canada / UK / Australia</strong><span>7-12 business days - calculated at checkout</span></div></div></section><section><p className="eyebrow">Returns</p><h2>Take your time</h2><p>{policies.returnsLead}</p><p>To start a return, email <a href={`mailto:${config.content.contact.email}`}>{config.content.contact.email}</a> with your order number. Final sale items and gift cards are not eligible.</p></section></div></div>;
}
