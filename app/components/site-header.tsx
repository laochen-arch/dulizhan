"use client";

import Link from "./site-link";
import { usePathname } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { config, catalog, activeSiteId, site } = useSiteRuntime();
  const { cartCount } = useStore(site?.id || activeSiteId);
  const pathname = usePathname();
  const brandParts = config.brand.name.trim().split(/\s+/);
  const categories = Array.from(new Set(catalog.filter((product) => product.status === "active").map((product) => product.category).filter(Boolean))).slice(0, 4);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    window.location.assign(`/shop${params.toString() ? `?${params.toString()}` : ""}`);
    setSearchOpen(false);
    setMenuOpen(false);
  }

  function isActive(href: string) {
    const route = href.split("?")[0];
    return route === "/" ? pathname === "/" : pathname.startsWith(route);
  }

  return (
    <header className="site-header storefront-header">
      <div className="announcement storefront-announcement">{config.announcement.text} <span>-</span> {config.announcement.accent}</div>
      <div className="nav-wrap container storefront-header-inner">
        <button type="button" className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span />
          <span />
        </button>
        <Link href="/" className="wordmark" onClick={() => setMenuOpen(false)}>
          <span className="wordmark-mark">{config.brand.mark}</span>
          <span>{brandParts[0]} <em>{brandParts.slice(1).join(" ")}</em></span>
        </Link>
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          {config.navigation.map((item) => <Link key={item.href} href={item.href} className={isActive(item.href) ? "is-active" : ""} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
          <Link href="/orders" className={isActive("/orders") ? "is-active" : ""} aria-current={isActive("/orders") ? "page" : undefined} onClick={() => setMenuOpen(false)}>Track order</Link>
          <Link href="/wishlist" className={isActive("/wishlist") ? "is-active" : ""} onClick={() => setMenuOpen(false)}>Wishlist</Link>
        </nav>
        <div className="nav-actions">
          {searchOpen ? <form className="nav-search-form" onSubmit={submitSearch}><label className="sr-only" htmlFor="nav-search-input">Search products</label><input id="nav-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gear" /><button type="submit" aria-label="Submit search">↗</button><button type="button" className="nav-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search">×</button></form> : <button type="button" className="nav-search-trigger" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><span className="nav-search-icon" aria-hidden="true">⌕</span> Search</button>}
          <Link href="/cart" className="cart-link" aria-label={`Cart with ${cartCount} items`}>
            Bag <span className="cart-count">{cartCount}</span>
          </Link>
        </div>
      </div>
      <nav className="storefront-quicknav" aria-label="Storefront categories">
        <div className="container storefront-quicknav-inner">
          <Link href="/" className={isActive("/") ? "is-active" : ""}>Today</Link>
          <Link href="/shop" className={isActive("/shop") ? "is-active" : ""}>Shop all</Link>
          {categories.map((category) => <Link key={category} href={`/shop?category=${encodeURIComponent(category)}`}>{category}</Link>)}
          <Link href="/orders" className={isActive("/orders") ? "is-active" : ""}>Order status</Link>
        </div>
      </nav>
    </header>
  );
}
