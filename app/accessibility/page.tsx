"use client";

import { useSiteRuntime } from "../components/site-runtime";

export default function AccessibilityPage() {
  const { config } = useSiteRuntime();
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / Accessibility</p><h1>Made for more<br /><em>ways of moving.</em></h1><p>We are working to make this storefront usable with keyboards, assistive technology and a range of screen sizes.</p></div><div className="policy-copy"><section><h2>Built into the interface</h2><p>Interactive controls have labels, focus states and keyboard support. Product images include alternative text, forms identify their errors and status updates use accessible announcements where appropriate.</p></section><section><h2>Need help?</h2><p>If something is difficult to use, email <a href={`mailto:${config.content.contact.email}`}>{config.content.contact.email}</a> and tell us the page, device and assistive technology involved. We will work with you on another route.</p></section></div></div>;
}
