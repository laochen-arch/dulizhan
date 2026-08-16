"use client";

import Link from "./site-link";
import { usePathname } from "next/navigation";
import { useSiteRuntime } from "./site-runtime";

export function StorefrontTrustBar() {
  const pathname = usePathname();
  const { config } = useSiteRuntime();
  if (["/admin", "/manage", "/merchant", "/platform", "/preview"].some((route) => pathname.startsWith(route))) return null;
  return <section className="storefront-trust-bar container" aria-label="Store promises"><div><strong>Secure PayPal checkout</strong><span>Payment is confirmed before your order is accepted.</span></div><div><strong>Clear delivery timing</strong><span>{config.content.policies.shippingLead} {config.content.policies.deliveryLead}</span></div><div><strong>Easy returns</strong><span><Link href="/shipping">{config.content.policies.returnsLead} Read the policy →</Link></span></div></section>;
}
