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
const CART_KEY = "northline-cart";
const serverState: StoreState = { cart: [], hydrated: false };
let state: StoreState = serverState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  if (typeof window !== "undefined") window.localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function defaultVariant(product: Product): ProductVariant {
  return product.variants[0] ?? { id: `${product.id}-default`, label: "Standard", swatch: "#20211e" };
}

function normalizeCart(items: Array<Partial<CartLine> & Product & { quantity: number }>): CartLine[] {
  return items.map((item) => {
    const variant = item.variants?.find((candidate) => candidate.id === item.variantId) ?? defaultVariant(item as Product);
    const variantId = item.variantId ?? variant.id;
    return {
      ...item,
      lineId: item.lineId ?? `${item.id}:${variantId}`,
      variantId,
      variantLabel: item.variantLabel ?? variant.label,
      variantPrice: item.variantPrice ?? variant.price ?? item.price,
    } as CartLine;
  });
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(CART_KEY);
    state = { cart: normalizeCart(saved ? JSON.parse(saved) : []), hydrated: true };
  } catch {
    window.localStorage.removeItem(CART_KEY);
    state = { cart: [], hydrated: true };
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => serverState);
  useEffect(hydrate, []);

  return {
    ...snapshot,
    cartCount: snapshot.cart.reduce((total, item) => total + item.quantity, 0),
    subtotal: snapshot.cart.reduce((total, item) => total + item.variantPrice * item.quantity, 0),
    addToCart: (product: Product, options: { variantId?: string; quantity?: number } = {}) => {
      const quantity = options.quantity ?? 1;
      const variant = product.variants.find((candidate) => candidate.id === options.variantId) ?? defaultVariant(product);
      const lineId = `${product.id}:${variant.id}`;
      const existing = state.cart.find((item) => item.lineId === lineId);
      const line: CartLine = { ...product, quantity, lineId, variantId: variant.id, variantLabel: variant.label, variantPrice: variant.price ?? product.price };
      state = { ...state, cart: existing ? state.cart.map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + quantity } : item) : [...state.cart, line] };
      persist();
      emit();
    },
    updateQuantity: (lineId: string, quantity: number) => {
      state = { ...state, cart: quantity <= 0 ? state.cart.filter((item) => item.lineId !== lineId) : state.cart.map((item) => item.lineId === lineId ? { ...item, quantity } : item) };
      persist();
      emit();
    },
    removeFromCart: (lineId: string) => {
      state = { ...state, cart: state.cart.filter((item) => item.lineId !== lineId) };
      persist();
      emit();
    },
  };
}
