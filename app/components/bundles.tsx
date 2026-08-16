"use client";

import { useEffect, useState } from "react";
import type { Product } from "../data/products";
import { useSiteRuntime } from "./site-runtime";
import { useStore } from "./cart-store";
import { showToast } from "./toast";

type Bundle = { id: string; name: string; productIds: string[]; discountType: string; discountValue: number };
export function BundleStrip({ catalog }: { catalog: Product[] }) {
  const { activeSiteId, site, config } = useSiteRuntime(); const { addToCart, openDrawer } = useStore(site?.id || activeSiteId); const [bundles, setBundles] = useState<Bundle[]>([]);
  useEffect(() => { void fetch("/api/bundles").then((response) => response.json()).then((payload: { bundles?: Bundle[] }) => setBundles(payload.bundles || [])).catch(() => undefined); }, [activeSiteId]);
  if (!bundles.length) return null;
  return <section className="bundle-strip"><div className="section-heading"><p className="eyebrow">Ready-made kits</p><h2>Bundle the essentials.</h2></div><div className="bundle-grid">{bundles.map((bundle) => { const products = bundle.productIds.map((id) => catalog.find((product) => product.id === id)).filter(Boolean) as Product[]; if (products.length < 2) return null; return <article className="bundle-card" key={bundle.id}><p className="eyebrow">{bundle.discountType === "percent" ? `${bundle.discountValue}% off` : `${config.commerce.currency} ${bundle.discountValue} off`}</p><h3>{bundle.name}</h3><p>{products.map((product) => product.name).join(" · ")}</p><button className="button button-outline" onClick={() => { products.forEach((product) => addToCart(product, { variantId: product.variants[0]?.id, quantity: 1 })); openDrawer(); showToast("Bundle added to your bag."); }}>Add bundle</button></article>; })}</div></section>;
}
