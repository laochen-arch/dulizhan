"use client";

import Link from "./site-link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { StorefrontAccessMenu } from "./storefront-access-menu";
import { trackAnalytics } from "./analytics-tracker";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { config, activeSiteId, site, catalog } = useSiteRuntime();
  const { cartCount } = useStore(site?.id || activeSiteId);
  const pathname = usePathname();
  const brandParts = config.brand.name.trim().split(/\s+/);
  const searchHistoryKey = `northline-search-v28:${encodeURIComponent(site?.id || activeSiteId)}:${typeof window === "undefined" ? "server" : window.location.hostname || "local"}`;
  const navigation = useMemo(() => {
    const seen = new Set<string>();
    return config.navigation.filter((item) => {
      // Category navigation belongs to the collection filter rail. Keeping it
      // out of the global header prevents the storefront from repeating the
      // same product taxonomy in two places.
      if (item.href.startsWith("/shop?category=")) return false;
      if (["/orders", "/wishlist", "/account", "/manage", "/admin"].includes(item.href)) return false;
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  }, [config.navigation]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(searchHistoryKey) || "[]") as unknown;
        setRecentSearches(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : []);
      } catch { setRecentSearches([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchHistoryKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    if (menuOpen || searchOpen) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    // Route changes can leave a drawer open when navigation comes from the browser controls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return catalog.filter((product) => product.status === "active" && `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(normalized)).slice(0, 5);
  }, [catalog, query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized) {
      const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 5);
      setRecentSearches(next); window.localStorage.setItem(searchHistoryKey, JSON.stringify(next));
      trackAnalytics("search_submitted", { payload: { query: normalized, source: "header" } });
    }
    const params = new URLSearchParams();
    if (normalized) params.set("search", normalized);
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
        <nav id="storefront-main-navigation" className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          {navigation.map((item) => <Link key={item.href} href={item.href} className={isActive(item.href) ? "is-active" : ""} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
          <Link href="/orders" className={isActive("/orders") ? "is-active" : ""} aria-current={isActive("/orders") ? "page" : undefined} onClick={() => setMenuOpen(false)}>Track order</Link>
          <Link href="/wishlist" className={isActive("/wishlist") ? "is-active" : ""} aria-current={isActive("/wishlist") ? "page" : undefined} onClick={() => setMenuOpen(false)}>Wishlist</Link>
        </nav>
        <div className="nav-actions">
          <StorefrontAccessMenu />
          {searchOpen ? <div className="nav-search-wrap"><form className="nav-search-form" onSubmit={submitSearch} role="search"><label className="sr-only" htmlFor="nav-search-input">Search products</label><input id="nav-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gear" autoComplete="off" aria-controls="nav-search-suggestions" /><button type="submit" aria-label="Submit search">↗</button><button type="button" className="nav-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search">×</button></form>{suggestions.length > 0 ? <div id="nav-search-suggestions" className="nav-search-suggestions" role="listbox" aria-label="Suggested products">{suggestions.map((product) => <Link key={product.id} href={`/products/${product.slug}`} role="option" aria-selected={false} onClick={() => { trackAnalytics("search_suggestion_clicked", { payload: { productId: product.id, query: query.trim() } }); setSearchOpen(false); setMenuOpen(false); }}><span>{product.name}</span><small>{product.category}</small></Link>)}<Link href={`/shop?search=${encodeURIComponent(query.trim())}`} className="nav-search-see-all" role="option" aria-selected={false} onClick={() => { trackAnalytics("search_submitted", { payload: { query: query.trim(), source: "header-see-all" } }); setSearchOpen(false); }}>See all results →</Link></div> : query.trim().length < 2 && recentSearches.length > 0 ? <div id="nav-search-suggestions" className="nav-search-suggestions nav-search-history" role="listbox" aria-label="Recent searches"><p>Recent searches</p>{recentSearches.map((item) => <button type="button" role="option" aria-selected={false} key={item} onClick={() => { setQuery(item); trackAnalytics("search_submitted", { payload: { query: item, source: "recent" } }); window.location.assign(`/shop?search=${encodeURIComponent(item)}`); }}>{item}</button>)}</div> : query.trim().length >= 2 ? <div id="nav-search-suggestions" className="nav-search-suggestions nav-search-empty" role="status"><p>No matching gear yet.</p><Link href={`/shop?search=${encodeURIComponent(query.trim())}`} onClick={() => setSearchOpen(false)}>Browse the full collection →</Link></div> : null}</div> : <button type="button" className="nav-search-trigger" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}><span className="nav-search-icon" aria-hidden="true">⌕</span> Search</button>}
          <Link href="/cart" className="cart-link" aria-label={`Cart with ${cartCount} items`}>
            Bag <span className="cart-count">{cartCount}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
