"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "./cart-store";
import { siteConfig } from "../data/site-config";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount } = useStore();

  return (
    <header className="site-header">
      <div className="announcement">Free US shipping on orders over $100 <span>•</span> Built for the long way around</div>
      <div className="nav-wrap container">
        <button
          className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <Link href="/" className="wordmark" onClick={() => setMenuOpen(false)}>
          <span className="wordmark-mark">{siteConfig.brand.mark}</span>
          <span>{siteConfig.brand.name.split(" ")[0]} <em>{siteConfig.brand.name.split(" ").slice(1).join(" ")}</em></span>
        </Link>
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          {siteConfig.navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
        </nav>
        <div className="nav-actions">
          <Link href="/shop" className="nav-search" aria-label="Browse products">Search <span>⌕</span></Link>
          <Link href="/cart" className="cart-link" aria-label={`Cart with ${cartCount} items`}>
            Bag <span className="cart-count">{cartCount}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
