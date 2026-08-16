"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import { useSiteRuntime } from "../components/site-runtime";
import { BundleStrip } from "../components/bundles";
import { RecentlyViewed } from "../components/recently-viewed";
import { trackAnalytics } from "../components/analytics-tracker";

const sortOptions = ["Featured", "Price: low to high", "Price: high to low"];
const priceOptions = ["Any price", "Under $50", "$50 - $150", "Over $150"];

export default function ShopPage() {
  const { catalog, config } = useSiteRuntime();
  const activeProducts = catalog.filter((product) => product.status === "active");
  const categories = useMemo(() => ["All gear", ...Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean)))], [activeProducts]);
  const [category, setCategory] = useState("All gear");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Featured");
  const [priceFilter, setPriceFilter] = useState("Any price");
  const [availability, setAvailability] = useState("All items");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);

  // URL parameters initialize the controlled filter state after mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get("category");
    const urlSearch = params.get("search") || params.get("q");
    const urlSort = params.get("sort");
    const urlPrice = params.get("price");
    const urlAvailability = params.get("availability");
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
    if (urlPrice && priceOptions.includes(urlPrice)) setPriceFilter(urlPrice);
    if (urlAvailability === "In stock" || urlAvailability === "Out of stock") setAvailability(urlAvailability);
  }, [categories]);

  useEffect(() => {
    function syncFromBrowserHistory() {
      const params = new URLSearchParams(window.location.search);
      const nextCategory = params.get("category");
      const nextSearch = params.get("search") || params.get("q") || "";
      const nextSort = params.get("sort");
      const nextPrice = params.get("price");
      const nextAvailability = params.get("availability");
      // Browser back/forward should update the visible collection, not only the address bar.
      setCategory(nextCategory && categories.includes(nextCategory) ? nextCategory : "All gear");
      setQuery(nextSearch);
      setSort(nextSort && sortOptions.includes(nextSort) ? nextSort : "Featured");
      setPriceFilter(nextPrice && priceOptions.includes(nextPrice) ? nextPrice : "Any price");
      setAvailability(nextAvailability === "In stock" || nextAvailability === "Out of stock" ? nextAvailability : "All items");
      setVisibleCount(12);
    }
    window.addEventListener("popstate", syncFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncFromBrowserHistory);
  }, [categories]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [filtersOpen]);

  function syncUrl(next: { category?: string; search?: string; sort?: string; price?: string; availability?: string }) {
    const params = new URLSearchParams();
    if (next.category && next.category !== "All gear") params.set("category", next.category);
    if (next.search) params.set("search", next.search);
    if (next.sort && next.sort !== "Featured") params.set("sort", next.sort);
    if (next.price && next.price !== "Any price") params.set("price", next.price);
    if (next.availability && next.availability !== "All items") params.set("availability", next.availability);
    window.history.replaceState({}, "", `/shop${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function chooseCategory(next: string) {
    setCategory(next); setVisibleCount(12);
    trackAnalytics("collection_filter_applied", { payload: { filter: "category", value: next } });
    syncUrl({ category: next, search: query, sort, price: priceFilter, availability });
  }

  function choosePrice(next: string) { setPriceFilter(next); setVisibleCount(12); trackAnalytics("collection_filter_applied", { payload: { filter: "price", value: next } }); syncUrl({ category, search: query, sort, price: next, availability }); }
  function chooseAvailability(next: string) { setAvailability(next); setVisibleCount(12); trackAnalytics("collection_filter_applied", { payload: { filter: "availability", value: next } }); syncUrl({ category, search: query, sort, price: priceFilter, availability: next }); }

  const filteredProducts = useMemo(() => {
    const normalized = query.toLowerCase();
    const list = activeProducts.filter((product) => {
      const priceMatch = priceFilter === "Any price" || (priceFilter === "Under $50" && product.price < 50) || (priceFilter === "$50 - $150" && product.price >= 50 && product.price <= 150) || (priceFilter === "Over $150" && product.price > 150);
      const stock = Math.max(0, product.variants.reduce((total, variant) => total + (variant.stock ?? product.stock), 0) || product.stock);
      const availabilityMatch = availability === "All items" || (availability === "In stock" && stock > 0) || (availability === "Out of stock" && stock <= 0);
      return priceMatch && availabilityMatch && (category === "All gear" || product.category === category) && `${product.name} ${product.description} ${product.sku} ${product.tags.join(" ")}`.toLowerCase().includes(normalized);
    });
    if (sort === "Price: low to high") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [activeProducts, category, query, sort, priceFilter, availability]);

  function reset() {
    setQuery(""); setCategory("All gear"); setSort("Featured"); setPriceFilter("Any price"); setAvailability("All items"); setVisibleCount(12); syncUrl({});
  }

  const hasActiveFilters = category !== "All gear" || Boolean(query.trim()) || sort !== "Featured" || priceFilter !== "Any price" || availability !== "All items";
  const emptyStateProducts = activeProducts.filter((product) => product.category !== category).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 3);
  const popularCategories = categories.filter((item) => item !== "All gear").slice(0, 4);

  return <div className="storefront-appstore appstore-shop-page shop-page container section-pad">
    <div className="appstore-shop-intro"><p className="appstore-kicker">{config.brand.name} <span>/</span> Store</p><h1>Everything you need.<br /><em>Nothing you don&apos;t.</em></h1><p>Thoughtful essentials for the way you move through the world.</p></div>
    <BundleStrip catalog={activeProducts} />
    <div className="appstore-shop-toolbar">
      <button type="button" className="mobile-filter-toggle" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>Filters <span>+</span></button>
      <div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} aria-selected={category === item} role="tab" onClick={() => chooseCategory(item)}>{item}</button>)}</div>
      <div className="shop-controls"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">Search products</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(12); syncUrl({ category, search: event.target.value, sort, price: priceFilter, availability }); }} onKeyDown={(event) => { if (event.key === "Enter") trackAnalytics("search_submitted", { payload: { query: query.trim(), source: "collection" } }); }} placeholder="Search gear" /></label><label className="shop-filter-select"><span className="sr-only">Price range</span><select value={priceFilter} onChange={(event) => choosePrice(event.target.value)}>{priceOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="shop-filter-select"><span className="sr-only">Availability</span><select value={availability} onChange={(event) => chooseAvailability(event.target.value)}><option>All items</option><option>In stock</option><option>Out of stock</option></select></label><label className="sort-field"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => { setSort(event.target.value); setVisibleCount(12); trackAnalytics("collection_filter_applied", { payload: { filter: "sort", value: event.target.value } }); syncUrl({ category, search: query, sort: event.target.value, price: priceFilter, availability }); }}>{sortOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div>
    </div>
    {hasActiveFilters && <div className="shop-active-filters" aria-label="Active filters"><span className="shop-active-label">Active filters</span>{category !== "All gear" && <button type="button" className="shop-filter-chip" onClick={() => chooseCategory("All gear")}>Category: {category}<span aria-hidden="true">×</span></button>}{query.trim() && <button type="button" className="shop-filter-chip" onClick={() => { setQuery(""); syncUrl({ category, sort, price: priceFilter, availability }); }}>Search: {query}<span aria-hidden="true">×</span></button>}{priceFilter !== "Any price" && <button type="button" className="shop-filter-chip" onClick={() => choosePrice("Any price")}>Price: {priceFilter}<span aria-hidden="true">×</span></button>}{availability !== "All items" && <button type="button" className="shop-filter-chip" onClick={() => chooseAvailability("All items")}>Stock: {availability}<span aria-hidden="true">×</span></button>}{sort !== "Featured" && <button type="button" className="shop-filter-chip" onClick={() => { setSort("Featured"); syncUrl({ category, search: query, price: priceFilter, availability }); }}>Sort: {sort}<span aria-hidden="true">×</span></button>}<button type="button" className="shop-clear-filters" onClick={reset}>Clear all</button></div>}
    {filtersOpen && <div className="mobile-filter-layer"><button type="button" className="mobile-filter-backdrop" onClick={() => setFiltersOpen(false)} aria-label="Close filters" /><aside className="mobile-filter-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title"><header><div><p className="eyebrow">Refine the collection</p><h2 id="mobile-filter-title">Find your gear.</h2></div><button type="button" className="cart-drawer-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button></header><div className="mobile-filter-group"><span className="detail-label">Category</span>{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} onClick={() => chooseCategory(item)}>{item}<span>{category === item ? "✓" : ""}</span></button>)}</div><label className="mobile-filter-sort"><span className="detail-label">Price</span><select value={priceFilter} onChange={(event) => choosePrice(event.target.value)}>{priceOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="mobile-filter-sort"><span className="detail-label">Availability</span><select value={availability} onChange={(event) => chooseAvailability(event.target.value)}><option>All items</option><option>In stock</option><option>Out of stock</option></select></label><label className="mobile-filter-sort"><span className="detail-label">Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); syncUrl({ category, search: query, sort: event.target.value, price: priceFilter, availability }); }}>{sortOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button type="button" className="button button-dark button-wide" onClick={() => setFiltersOpen(false)}>Show {filteredProducts.length} results</button></aside></div>}
    <div className="shop-meta" aria-live="polite"><span>{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}</span><span>{query ? `Results for "${query}"` : "Designed for the long way around"}</span></div>
    {filteredProducts.length ? <><div className="product-grid shop-product-grid appstore-shop-grid">{filteredProducts.slice(0, visibleCount).map((product) => <ProductCard key={product.id} product={product} />)}</div>{visibleCount < filteredProducts.length && <button type="button" className="button button-outline shop-load-more" onClick={() => setVisibleCount((count) => count + 12)}>Load more products <span aria-hidden="true">↓</span></button>}</> : <div className="empty-state shop-empty-discovery"><span className="empty-mark">O</span><h2>Nothing found.</h2><p>{query ? `We couldn’t find a match for “${query}”.` : "Try a different filter or browse all of our gear."}</p><div className="shop-empty-actions"><button type="button" className="button button-dark" onClick={reset}>Reset filters</button>{popularCategories.map((item) => <button type="button" className="button button-outline" key={item} onClick={() => chooseCategory(item)}>Browse {item}</button>)}</div>{emptyStateProducts.length > 0 && <div className="shop-empty-suggestions"><div className="section-heading"><p className="eyebrow">You may also like</p><h3>Start with these essentials.</h3></div><div className="appstore-product-rail">{emptyStateProducts.map((product) => <ProductCard key={product.id} product={product} variant="rail" />)}</div></div>}</div>}
    <RecentlyViewed />
  </div>;
}
