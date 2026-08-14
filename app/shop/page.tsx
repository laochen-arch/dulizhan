"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import { useSiteRuntime } from "../components/site-runtime";

export default function ShopPage() {
  const { catalog, config } = useSiteRuntime();
  const categories = useMemo(() => ["All gear", ...Array.from(new Set(catalog.map((product) => product.category).filter(Boolean)))], [catalog]);
  const [category, setCategory] = useState("All gear");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Featured");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get("category");
    const urlSearch = params.get("search") || params.get("q");
    const urlSort = params.get("sort");
    if (urlCategory && categories.includes(urlCategory)) {
      // The URL is the external source of truth for the initial filter state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(urlCategory);
    }
    if (urlSearch) {
      setQuery(urlSearch);
    }
    if (urlSort && ["Featured", "Price: low to high", "Price: high to low"].includes(urlSort)) {
      setSort(urlSort);
    }
  }, [categories]);

  function syncUrl(next: { category?: string; search?: string; sort?: string }) {
    const params = new URLSearchParams();
    if (next.category && next.category !== "All gear") params.set("category", next.category);
    if (next.search) params.set("search", next.search);
    if (next.sort && next.sort !== "Featured") params.set("sort", next.sort);
    const nextUrl = `/shop${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  const activeProducts = catalog.filter((product) => product.status === "active");
  const filteredProducts = useMemo(() => {
    const list = activeProducts.filter((product) => {
      const categoryMatch = category === "All gear" || product.category === category;
      const searchMatch = `${product.name} ${product.description} ${product.sku} ${product.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
      return categoryMatch && searchMatch;
    });
    if (sort === "Price: low to high") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [activeProducts, category, query, sort]);

  return <div className="shop-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / Shop</p><h1>Everything you need.<br /><em>Nothing you don&apos;t.</em></h1><p>Thoughtful essentials for the way you move through the world.</p></div><div className="shop-toolbar"><div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} aria-selected={category === item} role="tab" onClick={() => { setCategory(item); syncUrl({ category: item, search: query, sort }); }}>{item}</button>)}</div><div className="shop-controls"><label className="search-field"><span aria-hidden="true">?</span><span className="sr-only">Search products</span><input value={query} onChange={(event) => { setQuery(event.target.value); syncUrl({ category, search: event.target.value, sort }); }} placeholder="Search gear" /></label><label className="sort-field"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => { setSort(event.target.value); syncUrl({ category, search: query, sort: event.target.value }); }}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div></div><div className="shop-meta"><span>{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}</span><span>{query ? `Results for "${query}"` : "Designed for the long way around"}</span></div>{filteredProducts.length ? <div className="product-grid shop-product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><span className="empty-mark">O</span><h2>Nothing found.</h2><p>Try another search or browse all of our gear.</p><button type="button" className="button button-dark" onClick={() => { setQuery(""); setCategory("All gear"); setSort("Featured"); syncUrl({}); }}>Reset filters</button></div>}</div>;
}
