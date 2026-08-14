import Link from "next/link";
import { siteConfig } from "../data/site-config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <div className="wordmark footer-wordmark"><span className="wordmark-mark">{siteConfig.brand.mark}</span><span>{siteConfig.brand.name.split(" ")[0]} <em>{siteConfig.brand.name.split(" ").slice(1).join(" ")}</em></span></div>
          <p>{siteConfig.brand.footerLine}</p>
          <p className="footer-note">{siteConfig.brand.originLine}</p>
        </div>
        <div className="footer-column"><p className="footer-label">Explore</p><Link href="/shop">Shop all</Link><Link href="/about">Our story</Link><Link href="/faq">FAQ</Link></div>
        <div className="footer-column"><p className="footer-label">Support</p><Link href="/shipping">Shipping & returns</Link><a href={`mailto:${siteConfig.content.contact.email}`}>Contact us</a><a href={`mailto:${siteConfig.content.contact.tradeEmail}`}>Trade inquiries</a></div>
        <div className="footer-column"><p className="footer-label">Follow along</p><a href={siteConfig.content.contact.instagram} target="_blank" rel="noreferrer">Instagram ↗</a><a href={siteConfig.content.contact.pinterest} target="_blank" rel="noreferrer">Pinterest ↗</a><a href={siteConfig.content.contact.youtube} target="_blank" rel="noreferrer">YouTube ↗</a></div>
      </div>
      <div className="container footer-bottom"><span>© {new Date().getFullYear()} {siteConfig.brand.name}</span><span>Privacy · Terms · Accessibility</span></div>
    </footer>
  );
}
