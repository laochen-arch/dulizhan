"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "../data/products";
import { useStore } from "./cart-store";
import { showToast } from "./toast";

export function AddToCartButton({ product, compact = false, variantId, quantity = 1 }: { product: Product; compact?: boolean; variantId?: string; quantity?: number }) {
  const { addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
  const unavailable = product.status !== "active" || product.stock <= 0 || selected?.available === false;
  const price = selected?.price ?? product.price;

  return (
    <button
      type="button"
      disabled={unavailable}
      className={compact ? "add-button add-button-compact" : "button button-dark button-wide"}
      onClick={() => {
        addToCart(product, { variantId, quantity });
        setAdded(true);
        showToast(`${product.name} added to your bag.`);
        window.setTimeout(() => setAdded(false), 1800);
      }}
    >
      {unavailable ? "Currently unavailable" : added ? "Added to bag" : compact ? "Add to bag" : `Add to bag - $${price}`}
    </button>
  );
}

export function BuyNowButton({ product, variantId, quantity = 1 }: { product: Product; variantId?: string; quantity?: number }) {
  const { addToCart } = useStore();
  const selected = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
  const unavailable = product.status !== "active" || product.stock <= 0 || selected?.available === false;
  if (unavailable) return <button type="button" disabled className="button button-outline button-wide">Currently unavailable</button>;
  return <Link href="/checkout" className="button button-outline button-wide" onClick={() => addToCart(product, { variantId, quantity })}>Buy now</Link>;
}

export function QuantityControl({ id, quantity }: { id: string; quantity: number }) {
  const { updateQuantity } = useStore();
  return <div className="quantity-control" aria-label="Quantity"><button type="button" disabled={quantity <= 1} onClick={() => updateQuantity(id, quantity - 1)} aria-label="Decrease quantity">-</button><span>{quantity}</span><button type="button" onClick={() => updateQuantity(id, quantity + 1)} aria-label="Increase quantity">+</button></div>;
}

export function ProductPurchase({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0];
  const optionLabel = selected?.optionType || product.options[0]?.name || "Option";
  const maxQuantity = Math.max(1, product.stock);

  return <>
    <div className="detail-price">${selected?.price ?? product.price}{product.compareAt && <del>${product.compareAt}</del>}</div>
    <p className="detail-label">{optionLabel} <span className="selected-option">{selected?.label || "Standard"}</span></p>
    <div className="swatches" role="group" aria-label={`${optionLabel} options`}>{product.variants.map((variant) => <button type="button" key={variant.id} disabled={variant.available === false} className={`swatch ${variant.id === selected?.id ? "selected" : ""}`} title={`${variant.label}${variant.available === false ? " (unavailable)" : ""}`} aria-label={variant.label} aria-pressed={variant.id === selected?.id} onClick={() => setVariantId(variant.id)}><span style={{ backgroundColor: variant.swatch }} /></button>)}</div>
    <div className="product-quantity-row"><span className="detail-label">Quantity <small className="stock-note">{product.stock} in stock</small></span><div className="quantity-control product-quantity"><button type="button" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">-</button><span>{quantity}</span><button type="button" disabled={quantity >= maxQuantity} onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))} aria-label="Increase quantity">+</button></div></div>
    <div className="detail-actions"><AddToCartButton product={product} variantId={selected?.id} quantity={quantity} /><BuyNowButton product={product} variantId={selected?.id} quantity={quantity} /></div>
  </>;
}
