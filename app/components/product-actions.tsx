"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "../data/products";
import { useStore } from "./cart-store";

export function AddToCartButton({ product, compact = false, variantId, quantity = 1 }: { product: Product; compact?: boolean; variantId?: string; quantity?: number }) {
  const { addToCart } = useStore();
  const [added, setAdded] = useState(false);

  return (
    <button
      className={compact ? "add-button add-button-compact" : "button button-dark button-wide"}
      onClick={() => {
        addToCart(product, { variantId, quantity });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1800);
      }}
    >
      {added ? "Added to bag" : compact ? "Add to bag" : `Add to bag — $${product.price}`}
    </button>
  );
}

export function BuyNowButton({ product, variantId, quantity = 1 }: { product: Product; variantId?: string; quantity?: number }) {
  const { addToCart } = useStore();
  return <Link href="/checkout" className="button button-outline button-wide" onClick={() => addToCart(product, { variantId, quantity })}>Buy now</Link>;
}

export function QuantityControl({ id, quantity }: { id: string; quantity: number }) {
  const { updateQuantity } = useStore();
  return <div className="quantity-control" aria-label="Quantity"><button onClick={() => updateQuantity(id, quantity - 1)} aria-label="Decrease quantity">-</button><span>{quantity}</span><button onClick={() => updateQuantity(id, quantity + 1)} aria-label="Increase quantity">+</button></div>;
}

export function ProductPurchase({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];

  return <>
    <div className="detail-price">${selected?.price ?? product.price}{product.compareAt && <del>${product.compareAt}</del>}</div>
    <p className="detail-label">Color <span className="selected-option">{selected?.label}</span></p>
    <div className="swatches">{product.variants.map((variant) => <button key={variant.id} className={`swatch ${variant.id === selected?.id ? "selected" : ""}`} title={variant.label} aria-label={variant.label} aria-pressed={variant.id === selected?.id} onClick={() => setVariantId(variant.id)}><span style={{ backgroundColor: variant.swatch }} /></button>)}</div>
    <div className="product-quantity-row"><span className="detail-label">Quantity</span><div className="quantity-control product-quantity"><button onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">-</button><span>{quantity}</span><button onClick={() => setQuantity((current) => current + 1)} aria-label="Increase quantity">+</button></div></div>
    <div className="detail-actions"><AddToCartButton product={product} variantId={selected?.id} quantity={quantity} /><BuyNowButton product={product} variantId={selected?.id} quantity={quantity} /></div>
  </>;
}
