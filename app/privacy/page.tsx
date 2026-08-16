"use client";

import { useSiteRuntime } from "../components/site-runtime";

export default function PrivacyPage() {
  const { config } = useSiteRuntime();
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / Privacy</p><h1>Your information,<br /><em>handled carefully.</em></h1><p>How this storefront uses the details needed to operate your account, order and support experience.</p></div><div className="policy-copy"><section><h2>What we collect</h2><p>We collect contact, delivery and order details you provide during account creation or checkout. Payment details are handled by PayPal and are not stored by this storefront.</p></section><section><h2>Why we use it</h2><p>We use this information to process orders, send transactional updates, answer support requests and, only when you opt in, send field notes or product news.</p></section><section><h2>Your choices</h2><p>You can request access, correction or deletion of account information by contacting <a href={`mailto:${config.content.contact.email}`}>{config.content.contact.email}</a>. Marketing emails include an unsubscribe option.</p></section></div></div>;
}
