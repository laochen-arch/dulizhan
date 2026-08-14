"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "../data/products";
import { useStore } from "./cart-store";

export function AddToCartButton({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { addToCart } = useStore();
  const [added, setAdded] = useState(false);

  return (
    <button
      className={compact ? "add-button add-button-compact" : "button button-dark button-wide"}
      onClick={() => {
        addToCart(product);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1800);
      }}
    >
      {added ? "Added to bag ✓" : compact ? "Add to bag" : "Add to bag — $" + product.price}
    </button>
  );
}

export function BuyNowButton({ product }: { product: Product }) {
  const { addToCart } = useStore();
  return <Link href="/checkout" className="button button-outline button-wide" onClick={() => addToCart(product)}>Buy now</Link>;
}

export function QuantityControl({ id, quantity }: { id: string; quantity: number }) {
  const { updateQuantity } = useStore();
  return <div className="quantity-control" aria-label="Quantity"><button onClick={() => updateQuantity(id, quantity - 1)} aria-label="Decrease quantity">−</button><span>{quantity}</span><button onClick={() => updateQuantity(id, quantity + 1)} aria-label="Increase quantity">+</button></div>;
}
