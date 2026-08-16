"use client";

import { useMemo } from "react";
import { ProductCard } from "./product-card";
import { useSiteRuntime } from "./site-runtime";

export function CartRecommendations({ excludeIds }: { excludeIds: string[] }) {
  const { catalog } = useSiteRuntime();
  const products = useMemo(() => {
    const excluded = new Set(excludeIds);
    return catalog.filter((product) => product.status === "active" && !excluded.has(product.id)).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 4);
  }, [catalog, excludeIds]);
  if (!products.length) return null;
  return <section className="cart-recommendations" aria-labelledby="cart-recommendations-title"><div className="cart-section-heading"><div><p className="eyebrow">Complete the kit</p><h2 id="cart-recommendations-title">Made to go together.</h2></div><a className="text-link" href="/shop">See all gear →</a></div><div className="appstore-product-rail">{products.map((product) => <ProductCard product={product} variant="rail" key={product.id} />)}</div></section>;
}
