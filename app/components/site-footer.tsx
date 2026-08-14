"use client";

import Link from "next/link";
import { useSiteRuntime } from "./site-runtime";

export function SiteFooter() {
  const { config } = useSiteRuntime();
  const brandParts = config.brand.name.trim().split(/\s+/);
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <div className="wordmark footer-wordmark"><span className="wordmark-mark">{config.brand.mark}</span><span>{brandParts[0]} <em>{brandParts.slice(1).join(" ")}</em></span></div>
          <p>{config.brand.footerLine}</p>
          <p className="footer-note">{config.brand.originLine}</p>
        </div>
        <div className="footer-column"><p className="footer-label">Explore</p><Link href="/shop">Shop all</Link><Link href="/about">Our story</Link><Link href="/faq">FAQ</Link></div>
        <div className="footer-column"><p className="footer-label">Support</p><Link href="/shipping">Shipping & returns</Link><a href={`mailto:${config.content.contact.email}`}>Contact us</a><a href={`mailto:${config.content.contact.tradeEmail}`}>Trade inquiries</a></div>
        <div className="footer-column"><p className="footer-label">Follow along</p><a href={config.content.contact.instagram} target="_blank" rel="noreferrer">Instagram -&gt;</a><a href={config.content.contact.pinterest} target="_blank" rel="noreferrer">Pinterest -&gt;</a><a href={config.content.contact.youtube} target="_blank" rel="noreferrer">YouTube -&gt;</a></div>
      </div>
      <div className="container footer-bottom"><span>(c) {new Date().getFullYear()} {config.brand.name}</span><span><Link href="/shipping">{config.content.legal.privacyLabel}</Link> - <Link href="/shipping">{config.content.legal.termsLabel}</Link> - <Link href="/shipping">{config.content.legal.accessibilityLabel}</Link></span></div>
    </footer>
  );
}
