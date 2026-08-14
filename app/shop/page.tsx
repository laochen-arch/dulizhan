"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import { activeProducts, productCategories } from "../data/products";

const categories = ["All gear", ...productCategories];

export default function ShopPage() {
  const [category, setCategory] = useState("All gear");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Featured");

  useEffect(() => {
    const urlCategory = new URLSearchParams(window.location.search).get("category");
    if (urlCategory && categories.includes(urlCategory)) {
      // Read the initial filter from the URL once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(urlCategory);
    }
  }, []);

  const filteredProducts = useMemo(() => {
    const list = activeProducts.filter((product) => {
      const categoryMatch = category === "All gear" || product.category === category;
      const searchMatch = `${product.name} ${product.description} ${product.sku} ${product.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
      return categoryMatch && searchMatch;
    });
    if (sort === "Price: low to high") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price: high to low") return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [category, query, sort]);

  return <div className="shop-page container section-pad">
    <div className="page-intro"><p className="eyebrow">Northline / Shop</p><h1>Everything you need.<br /><em>Nothing you don’t.</em></h1><p>Thoughtful essentials for the way you move through the world.</p></div>
    <div className="shop-toolbar"><div className="category-tabs" role="tablist" aria-label="Product categories">{categories.map((item) => <button key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="shop-controls"><label className="search-field"><span>⌕</span><span className="sr-only">Search products</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gear" /></label><label className="sort-field"><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option></select></label></div></div>
    <div className="shop-meta"><span>{filteredProducts.length} {filteredProducts.length === 1 ? "piece" : "pieces"}</span><span>Designed for the long way around</span></div>
    {filteredProducts.length ? <div className="product-grid shop-product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><span className="empty-mark">×</span><h2>Nothing found.</h2><p>Try another search or browse all of our gear.</p><button className="button button-dark" onClick={() => { setQuery(""); setCategory("All gear"); }}>Reset filters</button></div>}
  </div>;
}
