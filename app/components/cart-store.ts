"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Product } from "../data/products";

export type CartLine = Product & { quantity: number };
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

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(CART_KEY);
    state = { cart: saved ? JSON.parse(saved) : [], hydrated: true };
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
    subtotal: snapshot.cart.reduce((total, item) => total + item.price * item.quantity, 0),
    addToCart: (product: Product, quantity = 1) => {
      const existing = state.cart.find((item) => item.id === product.id);
      state = { ...state, cart: existing ? state.cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item) : [...state.cart, { ...product, quantity }] };
      persist();
      emit();
    },
    updateQuantity: (id: string, quantity: number) => {
      state = { ...state, cart: quantity <= 0 ? state.cart.filter((item) => item.id !== id) : state.cart.map((item) => item.id === id ? { ...item, quantity } : item) };
      persist();
      emit();
    },
    removeFromCart: (id: string) => {
      state = { ...state, cart: state.cart.filter((item) => item.id !== id) };
      persist();
      emit();
    },
  };
}

