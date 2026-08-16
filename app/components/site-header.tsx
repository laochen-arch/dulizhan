"use client";

import Link from "./site-link";
import { usePathname } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { StorefrontAccessMenu } from "./storefront-access-menu";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { config, activeSiteId, site, catalog } = useSiteRuntime();
  const { cartCount } = useStore(site?.id || activeSiteId);
  const pathname = usePathname();
  const brandParts = config.brand.name.trim().split(/\s+/);
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return catalog.filter((product) => product.status === "active" && `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 5);
  }, [catalog, query]);

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
          <StorefrontAccessMenu />
          {searchOpen ? <div className="nav-search-wrap"><form className="nav-search-form" onSubmit={submitSearch} role="search"><label className="sr-only" htmlFor="nav-search-input">Search products</label><input id="nav-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gear" autoComplete="off" aria-controls="nav-search-suggestions" /><button type="submit" aria-label="Submit search">↗</button><button type="button" className="nav-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search">×</button></form>{suggestions.length > 0 && <div id="nav-search-suggestions" className="nav-search-suggestions" role="listbox" aria-label="Suggested products">{suggestions.map((product) => <Link key={product.id} href={`/products/${product.slug}`} role="option" onClick={() => { setSearchOpen(false); setMenuOpen(false); }}><span>{product.name}</span><small>{product.category}</small></Link>)}<Link href={`/shop?search=${encodeURIComponent(query.trim())}`} className="nav-search-see-all" role="option" onClick={() => setSearchOpen(false)}>See all results →</Link></div>}</div> : <button type="button" className="nav-search-trigger" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><span className="nav-search-icon" aria-hidden="true">⌕</span> Search</button>}
          <Link href="/cart" className="cart-link" aria-label={`Cart with ${cartCount} items`}>
            Bag <span className="cart-count">{cartCount}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
