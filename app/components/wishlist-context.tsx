"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSiteRuntime } from "./site-runtime";

const WISHLIST_PREFIX = "northline-wishlist-v26";

export function wishlistKey(siteId: string) {
  const host = typeof window === "undefined" ? "server" : window.location.hostname || "local";
  return `${WISHLIST_PREFIX}:${encodeURIComponent(siteId)}:${host}`;
}

export function readWishlist(siteId: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(wishlistKey(siteId)) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    window.localStorage.removeItem(wishlistKey(siteId));
    return [];
  }
}

type WishlistContextValue = {
  ids: string[];
  hydrated: boolean;
  authenticated: boolean;
  toggle: (productId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

function persistLocal(siteId: string, ids: string[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(wishlistKey(siteId), JSON.stringify(ids));
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { activeSiteId, site } = useSiteRuntime();
  const siteId = site?.id || activeSiteId;
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    const localIds = readWishlist(siteId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(localIds);
    setHydrated(false);
    const syncTimer = window.setTimeout(() => void (async () => {
      try {
        const sessionResponse = await fetch("/api/account/session", { cache: "no-store" });
        const session = await sessionResponse.json().catch(() => ({})) as { access?: { authenticated?: boolean } };
        if (!session.access?.authenticated) {
          if (active) { setAuthenticated(false); setHydrated(true); }
          return;
        }
        const response = await fetch("/api/account/wishlist", { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { items?: Array<{ productId?: string }> };
        const serverIds = response.ok ? (payload.items || []).map((item) => item.productId).filter((item): item is string => Boolean(item)) : [];
        const merged = Array.from(new Set([...serverIds, ...localIds]));
        if (active) { setAuthenticated(true); setIds(merged); setHydrated(true); }
        if (localIds.length) {
          await Promise.all(localIds.filter((productId) => !serverIds.includes(productId)).map((productId) => fetch("/api/account/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) })));
          persistLocal(siteId, []);
        }
      } catch {
        if (active) { setAuthenticated(false); setHydrated(true); }
      }
    })(), 500);
    return () => { active = false; window.clearTimeout(syncTimer); };
  }, [siteId]);

  const toggle = useCallback((productId: string) => {
    setIds((current) => {
      const exists = current.includes(productId);
      const next = exists ? current.filter((id) => id !== productId) : [...current, productId];
      if (!authenticated) persistLocal(siteId, next);
      void (authenticated ? fetch(exists ? `/api/account/wishlist?productId=${encodeURIComponent(productId)}` : "/api/account/wishlist", { method: exists ? "DELETE" : "POST", headers: exists ? undefined : { "Content-Type": "application/json" }, body: exists ? undefined : JSON.stringify({ productId }) }).catch(() => undefined) : Promise.resolve());
      return next;
    });
  }, [authenticated, siteId]);

  const value = useMemo(() => ({ ids, hydrated, authenticated, toggle }), [authenticated, hydrated, ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside WishlistProvider");
  return context;
}
