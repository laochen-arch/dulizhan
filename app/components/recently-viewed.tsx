"use client";

import { useEffect, useState } from "react";
import type { Product } from "../data/products";
import { useSiteRuntime } from "./site-runtime";
import { ProductCard } from "./product-card";

const RECENT_PREFIX = "northline-recent-v26";

function recentKey(siteId: string) {
  const host = typeof window === "undefined" ? "server" : window.location.hostname || "local";
  return `${RECENT_PREFIX}:${encodeURIComponent(siteId)}:${host}`;
}

function readRecent(siteId: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentKey(siteId)) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch {
    window.localStorage.removeItem(recentKey(siteId));
    return [];
  }
}

function writeRecent(siteId: string, ids: string[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(recentKey(siteId), JSON.stringify(ids.slice(0, 8)));
}

export function RecentlyViewedTracker({ productId }: { productId: string }) {
  const { activeSiteId, site } = useSiteRuntime();
  const siteId = site?.id || activeSiteId;
  useEffect(() => {
    const ids = readRecent(siteId);
    writeRecent(siteId, [productId, ...ids.filter((id) => id !== productId)]);
  }, [productId, siteId]);
  return null;
}

export function RecentlyViewed({ excludeId }: { excludeId?: string } = {}) {
  const { activeSiteId, site, catalog } = useSiteRuntime();
  const siteId = site?.id || activeSiteId;
  const [ids, setIds] = useState<string[]>([]);
  // Device-local history is intentionally loaded after the first paint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIds(readRecent(siteId)); }, [siteId]);
  const products = ids.map((id) => catalog.find((product) => product.id === id)).filter((product): product is Product => Boolean(product) && product.id !== excludeId && product.status === "active").slice(0, 4);
  if (!products.length) return null;
  return <section className="recently-viewed appstore-discovery-rail"><div className="appstore-section-heading compact"><div><p className="appstore-kicker">Pick up where you left off</p><h2>Recently<br /><em>viewed.</em></h2></div></div><div className="appstore-product-rail">{products.map((product) => <ProductCard product={product} variant="rail" key={product.id} />)}</div></section>;
}
