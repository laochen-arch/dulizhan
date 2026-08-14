"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { products, type Product } from "../data/products";
import { siteConfig, type SiteConfig } from "../data/site-config";

export type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

export type EditableSiteConfig = DeepMutable<SiteConfig>;
export type CmsStatus = "connecting" | "synced" | "saving" | "saved" | "offline" | "auth-required" | "error";

export const SITE_CONFIG_STORAGE_KEY = "northline-site-config-v3";
export const PRODUCT_CATALOG_STORAGE_KEY = "northline-product-catalog-v3";

type CmsPayload = {
  config: SiteConfig;
  catalog: Product[];
};

type RuntimeContextValue = {
  config: EditableSiteConfig;
  catalog: Product[];
  hydrated: boolean;
  cmsStatus: CmsStatus;
  cmsError: string;
  updateConfig: (updater: (current: EditableSiteConfig) => EditableSiteConfig) => void;
  updateCatalog: (updater: (current: Product[]) => Product[]) => void;
  resetConfig: () => void;
  resetCatalog: () => void;
  refreshCms: () => Promise<void>;
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultConfig() {
  return clone(siteConfig) as EditableSiteConfig;
}

function mergeConfig<T>(base: T, override: Partial<T>): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) return (override ?? base) as T;
  const result = { ...(base as object) } as Record<string, unknown>;
  Object.entries(override as Record<string, unknown>).forEach(([key, value]) => {
    const current = result[key];
    result[key] = value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
      ? mergeConfig(current, value as Partial<typeof current>)
      : value;
  });
  return result as T;
}

function normalizeProduct(input: Partial<Product>): Product | null {
  if (!input.id || !input.slug || !input.name) return null;
  const fallback = products.find((product) => product.id === input.id) ?? products[0];
  const image = input.image || fallback.image;
  const rawVariants = input.variants?.length ? input.variants : fallback.variants;
  return {
    ...clone(fallback),
    ...input,
    image,
    images: input.images?.length ? input.images : [image],
    options: input.options?.length ? input.options : [{ name: "Color", values: input.colors ?? fallback.colors }],
    variants: rawVariants.map((variant, index) => ({
      ...fallback.variants[index % Math.max(fallback.variants.length, 1)],
      ...variant,
      id: variant.id || `${input.id}-variant-${index + 1}`,
      label: variant.label || `Option ${index + 1}`,
      sku: variant.sku || `${input.sku || fallback.sku}-${String(index + 1).padStart(2, "0")}`,
      optionType: variant.optionType || "Option",
      swatch: variant.swatch || "#20211e",
      available: variant.available ?? true,
    })),
    tags: input.tags?.length ? input.tags : fallback.tags,
    relatedSlugs: input.relatedSlugs ?? [],
    stock: typeof input.stock === "number" ? input.stock : fallback.stock,
    status: input.status === "draft" ? "draft" : "active",
    featured: Boolean(input.featured),
  };
}

function readStoredCatalog(): Product[] {
  try {
    const saved = window.localStorage.getItem(PRODUCT_CATALOG_STORAGE_KEY);
    if (!saved) return clone(products);
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return clone(products);
    const normalized = parsed.map((item) => normalizeProduct(item as Partial<Product>)).filter(Boolean) as Product[];
    return normalized.length ? normalized : clone(products);
  } catch {
    window.localStorage.removeItem(PRODUCT_CATALOG_STORAGE_KEY);
    return clone(products);
  }
}

async function fetchCmsPayload(): Promise<CmsPayload> {
  const response = await fetch("/api/cms", { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as CmsPayload & { error?: string; code?: string };
  if (!response.ok) {
    const error = new Error(payload.error || "CMS is unavailable.") as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }
  if (!payload.config || !Array.isArray(payload.catalog)) throw new Error("CMS returned an invalid storefront payload.");
  return payload;
}

function getCmsError(error: unknown) {
  return error instanceof Error ? error.message : "CMS is unavailable.";
}

function getCmsStatus(error: unknown): CmsStatus {
  return (error as Error & { code?: string })?.code === "AUTH_REQUIRED" ? "auth-required" : "offline";
}

export function SiteRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<EditableSiteConfig>(defaultConfig);
  const [catalog, setCatalog] = useState<Product[]>(() => clone(products));
  const [hydrated, setHydrated] = useState(false);
  const [cmsStatus, setCmsStatus] = useState<CmsStatus>("connecting");
  const [cmsError, setCmsError] = useState("");
  const [cmsReady, setCmsReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const cmsDirty = useRef(false);
  const changeVersion = useRef(0);

  const applyCmsPayload = useCallback((payload: CmsPayload) => {
    const nextConfig = mergeConfig(defaultConfig(), payload.config);
    const nextCatalog = payload.catalog.map((item) => normalizeProduct(item)).filter(Boolean) as Product[];
    setConfig(nextConfig);
    setCatalog(nextCatalog);
    cmsDirty.current = false;
    window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
    window.localStorage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(nextCatalog));
  }, []);

  const refreshCms = useCallback(async () => {
    setCmsStatus("connecting");
    setCmsError("");
    try {
      const payload = await fetchCmsPayload();
      applyCmsPayload(payload);
      setCmsReady(true);
      setCmsStatus("synced");
    } catch (error) {
      setCmsReady(false);
      setCmsStatus(getCmsStatus(error));
      setCmsError(getCmsError(error));
    }
  }, [applyCmsPayload]);

  useEffect(() => {
    try {
      const savedConfig = window.localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        // Hydrate the last known storefront while the authoritative CMS is loading.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConfig(mergeConfig(defaultConfig(), JSON.parse(savedConfig)));
      }
      setCatalog(readStoredCatalog());
    } catch {
      window.localStorage.removeItem(SITE_CONFIG_STORAGE_KEY);
      window.localStorage.removeItem(PRODUCT_CATALOG_STORAGE_KEY);
    }
    setHydrated(true);
    void refreshCms();
  }, [refreshCms]);

  useEffect(() => {
    if (!hydrated || !cmsReady || !cmsDirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const versionAtSchedule = changeVersion.current;
    saveTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/cms", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config, catalog }),
        });
        const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
        if (!response.ok) {
          const error = new Error(payload.error || "CMS save failed.") as Error & { code?: string };
          error.code = payload.code;
          throw error;
        }
        if (changeVersion.current === versionAtSchedule) {
          cmsDirty.current = false;
          setCmsStatus("saved");
          setCmsError("");
        }
      } catch (error) {
        setCmsStatus(getCmsStatus(error));
        setCmsError(getCmsError(error));
      }
    }, 650);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [catalog, config, cmsReady, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    Object.entries(config.theme.colors).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value);
    });
  }, [config, hydrated]);

  const updateConfig = useCallback((updater: (current: EditableSiteConfig) => EditableSiteConfig) => {
    cmsDirty.current = true;
    changeVersion.current += 1;
    if (cmsReady) setCmsStatus("saving");
    setConfig((current) => {
      const next = updater(clone(current));
      window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [cmsReady]);

  const updateCatalog = useCallback((updater: (current: Product[]) => Product[]) => {
    cmsDirty.current = true;
    changeVersion.current += 1;
    if (cmsReady) setCmsStatus("saving");
    setCatalog((current) => {
      const next = updater(clone(current)).map((product) => normalizeProduct(product)).filter(Boolean) as Product[];
      window.localStorage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [cmsReady]);

  const resetConfig = useCallback(() => {
    cmsDirty.current = true;
    changeVersion.current += 1;
    if (cmsReady) setCmsStatus("saving");
    window.localStorage.removeItem(SITE_CONFIG_STORAGE_KEY);
    setConfig(defaultConfig());
  }, [cmsReady]);

  const resetCatalog = useCallback(() => {
    cmsDirty.current = true;
    changeVersion.current += 1;
    if (cmsReady) setCmsStatus("saving");
    window.localStorage.removeItem(PRODUCT_CATALOG_STORAGE_KEY);
    setCatalog(clone(products));
  }, [cmsReady]);

  const value = useMemo(
    () => ({ config, catalog, hydrated, cmsStatus, cmsError, updateConfig, updateCatalog, resetConfig, resetCatalog, refreshCms }),
    [catalog, config, cmsError, cmsStatus, hydrated, refreshCms, resetCatalog, resetConfig, updateCatalog, updateConfig],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useSiteRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("useSiteRuntime must be used inside SiteRuntimeProvider");
  return context;
}
