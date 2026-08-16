"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import { useSiteRuntime } from "../components/site-runtime";
import { BundleStrip } from "../components/bundles";
import { RecentlyViewed } from "../components/recently-viewed";

const sortOptions = ["Featured", "Price: low to high", "Price: high to low"];

export default function ShopPage() {
  const { catalog, config } = useSiteRuntime();
  const activeProducts = catalog.filter((product) => product.status === "active");
  const categories = useMemo(() => ["All gear", ...Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean)))], [activeProducts]);
  const [category, setCategory] = useState("All gear");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // URL parameters initialize the controlled filter state after mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get("category");
    const urlSearch = params.get("search") || params.get("q");
    const urlSort = params.get("sort");
    if (urlCategory && categories.includes(urlCategory)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(urlCategory);
    }
    if (urlSearch) {
      setQuery(urlSearch);
    }
    if (urlSort && sortOptions.includes(urlSort)) {
      setSort(urlSort);
    }
  }, [categories]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [filtersOpen]);

  function syncUrl(next: { category?: string; search?: string; sort?: string }) {
    const params = new URLSearchParams();
    if (next.category && next.category !== "All gear") params.set("category", next.category);
    if (next.search) params.set("search", next.search);
    if (next.sort && next.sort !== "Featured") params.set("sort", next.sort);
    window.history.replaceState({}, "", `/shop${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function chooseCategory(next: string) {
    setCategory(next);
    syncUrl({ category: next, search: query, sort });
  }

  const filteredProducts = useMemo(() => {
    const normalized = query.toLowerCase();
    const list = activeProducts.filter((product) => (category === "All gear" || product.category === category) && `${product.name} ${product.description} ${product.sku} ${product.tags.join(" ")}`.toLowerCase().includes(normalized));
    if (sort === "Price: low to high") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [activeProducts, category, query, sort]);

  function reset() {
    setQuery(""); setCategory("All gear"); setSort("Featured"); syncUrl({});
  }

  return <div className="storefront-appstore appstore-shop-page shop-page container section-pad">
    <div className="appstore-shop-intro"><p className="appstore-kicker">{config.brand.name} <span>/</span> Store</p><h1>Everything you need.<br /><em>Nothing you don&apos;t.</em></h1><p>Thoughtful essentials for the way you move through the world.</p></div>
    <BundleStrip catalog={activeProducts} />
    <div className="appstore-shop-toolbar">
      <button type="button" className="mobile-filter-toggle" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>Filters <span>+</span></button>
      <div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} aria-selected={category === item} role="tab" onClick={() => chooseCategory(item)}>{item}</button>)}</div>
      <div className="shop-controls"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">Search products</span><input value={query} onChange={(event) => { setQuery(event.target.value); syncUrl({ category, search: event.target.value, sort }); }} placeholder="Search gear" /></label><label className="sort-field"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => { setSort(event.target.value); syncUrl({ category, search: query, sort: event.target.value }); }}>{sortOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div>
    </div>
    {filtersOpen && <div className="mobile-filter-layer"><button type="button" className="mobile-filter-backdrop" onClick={() => setFiltersOpen(false)} aria-label="Close filters" /><aside className="mobile-filter-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title"><header><div><p className="eyebrow">Refine the collection</p><h2 id="mobile-filter-title">Find your gear.</h2></div><button type="button" className="cart-drawer-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button></header><div className="mobile-filter-group"><span className="detail-label">Category</span>{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} onClick={() => chooseCategory(item)}>{item}<span>{category === item ? "✓" : ""}</span></button>)}</div><label className="mobile-filter-sort"><span className="detail-label">Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); syncUrl({ category, search: query, sort: event.target.value }); }}>{sortOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button type="button" className="button button-dark button-wide" onClick={() => setFiltersOpen(false)}>Show {filteredProducts.length} results</button></aside></div>}
    <div className="shop-meta" aria-live="polite"><span>{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}</span><span>{query ? `Results for "${query}"` : "Designed for the long way around"}</span></div>
    {filteredProducts.length ? <div className="product-grid shop-product-grid appstore-shop-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><span className="empty-mark">O</span><h2>Nothing found.</h2><p>Try another search or browse all of our gear.</p><button type="button" className="button button-dark" onClick={reset}>Reset filters</button></div>}
    <RecentlyViewed />
  </div>;
}
