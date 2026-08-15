"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Product, ProductVariant } from "../data/products";

export type CartLine = Product & {
  quantity: number;
  lineId: string;
  variantId: string;
  variantLabel: string;
  variantPrice: number;
};

type StoreState = { cart: CartLine[]; hydrated: boolean };
type PersistedCartLine = Partial<CartLine> & Product & { quantity: number };
const CART_PREFIX = "northline-cart-v20";
const serverState: StoreState = { cart: [], hydrated: false };
const stores = new Map<string, StoreState>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(scope: string) {
  const host = typeof window === "undefined" ? "server" : window.location.hostname || "local";
  return `${CART_PREFIX}:${encodeURIComponent(scope)}:${host}`;
}

function getStore(key: string) {
  const existing = stores.get(key);
  if (existing) return existing;
  const created: StoreState = { cart: [], hydrated: false };
  stores.set(key, created);
  return created;
}

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function persist(key: string, cart: CartLine[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(cart));
}

function defaultVariant(product: Product): ProductVariant {
  return product.variants[0] ?? {
    id: `${product.id}-default`,
    label: "Standard",
    swatch: "#20211e",
    sku: `${product.sku}-01`,
    optionType: "Option",
    available: true,
  };
}

function normalizeCart(items: PersistedCartLine[]): CartLine[] {
  return items.map((item) => {
    const variant = item.variants?.find((candidate) => candidate.id === item.variantId) ?? defaultVariant(item as Product);
    const variantId = item.variantId ?? variant.id;
    return {
      ...item,
      images: item.images?.length ? item.images : item.image ? [item.image] : [],
      lineId: item.lineId ?? `${item.id}:${variantId}`,
      variantId,
      variantLabel: item.variantLabel ?? variant.label,
      variantPrice: item.variantPrice ?? variant.price ?? item.price,
    } as CartLine;
  });
}

function hydrate(key: string) {
  const current = getStore(key);
  if (current.hydrated || typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    stores.set(key, { cart: Array.isArray(parsed) ? normalizeCart(parsed as PersistedCartLine[]) : [], hydrated: true });
  } catch {
    window.localStorage.removeItem(key);
    stores.set(key, { cart: [], hydrated: true });
  }
  emit(key);
}

function subscribe(key: string, listener: () => void) {
  const bucket = listeners.get(key) ?? new Set<() => void>();
  bucket.add(listener);
  listeners.set(key, bucket);
  return () => bucket.delete(listener);
}

export function useStore(scope = "default") {
  const key = storageKey(scope);
  const snapshot = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => getStore(key),
    () => serverState,
  );
  useEffect(() => hydrate(key), [key]);

  return {
    ...snapshot,
    cartCount: snapshot.cart.reduce((total, item) => total + item.quantity, 0),
    subtotal: snapshot.cart.reduce((total, item) => total + item.variantPrice * item.quantity, 0),
    addToCart: (product: Product, options: { variantId?: string; quantity?: number } = {}) => {
      const current = getStore(key);
      const quantity = options.quantity ?? 1;
      const variant = product.variants.find((candidate) => candidate.id === options.variantId) ?? defaultVariant(product);
      const lineId = `${product.id}:${variant.id}`;
      const existing = current.cart.find((item) => item.lineId === lineId);
      const line: CartLine = { ...product, quantity, lineId, variantId: variant.id, variantLabel: variant.label, variantPrice: variant.price ?? product.price };
      const cart = existing ? current.cart.map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + quantity } : item) : [...current.cart, line];
      stores.set(key, { ...current, cart });
      persist(key, cart);
      emit(key);
    },
    updateQuantity: (lineId: string, quantity: number) => {
      const current = getStore(key);
      const cart = quantity <= 0 ? current.cart.filter((item) => item.lineId !== lineId) : current.cart.map((item) => item.lineId === lineId ? { ...item, quantity } : item);
      stores.set(key, { ...current, cart });
      persist(key, cart);
      emit(key);
    },
    removeFromCart: (lineId: string) => {
      const current = getStore(key);
      const cart = current.cart.filter((item) => item.lineId !== lineId);
      stores.set(key, { ...current, cart });
      persist(key, cart);
      emit(key);
    },
    clearCart: () => {
      const current = getStore(key);
      stores.set(key, { ...current, cart: [] });
      persist(key, []);
      emit(key);
    },
  };
}
