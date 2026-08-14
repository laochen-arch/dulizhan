"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product, ProductVariant } from "../data/products";
import { variantOptionValues } from "../data/products";
import { useStore } from "./cart-store";
import { showToast } from "./toast";

function fallbackVariant(product: Product): ProductVariant {
  return product.variants[0] ?? {
    id: `${product.id}-default`,
    label: "Standard",
    swatch: "#20211e",
    sku: `${product.sku}-01`,
    optionType: "Option",
    available: true,
  };
}

function availableStock(product: Product, variant?: ProductVariant) {
  return Math.max(0, variant?.stock ?? product.stock);
}

function isSellable(product: Product, variant?: ProductVariant) {
  return product.status === "active" && Boolean(variant?.available !== false) && availableStock(product, variant) > 0;
}

export function AddToCartButton({ product, compact = false, variantId, quantity = 1 }: { product: Product; compact?: boolean; variantId?: string; quantity?: number }) {
  const { addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? fallbackVariant(product);
  const unavailable = !isSellable(product, selected);
  const price = selected.price ?? product.price;

  return (
    <button
      type="button"
      disabled={unavailable}
      className={compact ? "add-button add-button-compact" : "button button-dark button-wide"}
      onClick={() => {
        addToCart(product, { variantId: selected.id, quantity: Math.min(quantity, availableStock(product, selected)) });
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
  const selected = product.variants.find((variant) => variant.id === variantId) ?? fallbackVariant(product);
  if (!isSellable(product, selected)) return <button type="button" disabled className="button button-outline button-wide">Currently unavailable</button>;
  return <Link href="/checkout" className="button button-outline button-wide" onClick={() => addToCart(product, { variantId: selected.id, quantity: Math.min(quantity, availableStock(product, selected)) })}>Buy now</Link>;
}

export function QuantityControl({ id, quantity }: { id: string; quantity: number }) {
  const { updateQuantity } = useStore();
  return <div className="quantity-control" aria-label="Quantity"><button type="button" disabled={quantity <= 1} onClick={() => updateQuantity(id, quantity - 1)} aria-label="Decrease quantity">-</button><span>{quantity}</span><button type="button" onClick={() => updateQuantity(id, quantity + 1)} aria-label="Increase quantity">+</button></div>;
}

function optionGroups(product: Product) {
  if (product.options.length) return product.options;
  const groups = new Map<string, string[]>();
  product.variants.forEach((variant) => Object.entries(variantOptionValues(variant)).forEach(([name, value]) => {
    const values = groups.get(name) ?? [];
    if (!values.includes(value)) values.push(value);
    groups.set(name, values);
  }));
  return Array.from(groups.entries()).map(([name, values]) => ({ name, values }));
}

export function ProductPurchase({ product }: { product: Product }) {
  const initialVariant = product.variants[0] ?? fallbackVariant(product);
  const [variantId, setVariantId] = useState(initialVariant.id);
  const [selection, setSelection] = useState<Record<string, string>>(variantOptionValues(initialVariant));
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === variantId) ?? initialVariant;
  const selectedValues = variantOptionValues(selected);
  const groups = optionGroups(product);
  const stock = availableStock(product, selected);
  const price = selected.price ?? product.price;

  function chooseOption(name: string, value: string) {
    const nextSelection = { ...selection, [name]: value };
    const matching = product.variants.find((variant) => {
      const values = variantOptionValues(variant);
      return variant.available !== false && availableStock(product, variant) > 0 && Object.entries(nextSelection).every(([key, candidate]) => values[key] === candidate);
    }) ?? product.variants.find((variant) => variantOptionValues(variant)[name] === value);
    setSelection(nextSelection);
    if (matching) {
      setVariantId(matching.id);
      setSelection({ ...nextSelection, ...variantOptionValues(matching) });
      setQuantity(1);
    }
  }

  return <>
    <div className="detail-price">${price}{product.compareAt && <del>${product.compareAt}</del>}</div>
    <p className="detail-sku">SKU {selected.sku} · {stock > 0 ? `${stock} in stock` : "Out of stock"}</p>
    {groups.map((group) => <div className="product-option-group" key={group.name}>
      <div className="detail-label">{group.name} <span className="selected-option">{selectedValues[group.name] || selection[group.name] || "Select"}</span></div>
      <div className="swatches" role="group" aria-label={`${group.name} options`}>
        {group.values.map((value) => {
          const matching = product.variants.find((variant) => variantOptionValues(variant)[group.name] === value);
          const disabled = !matching || matching.available === false || availableStock(product, matching) <= 0;
          const isSelected = selectedValues[group.name] === value;
          return <button type="button" key={`${group.name}-${value}`} disabled={disabled} className={`swatch ${isSelected ? "selected" : ""} ${group.name.toLowerCase() === "color" ? "swatch-color" : "swatch-text"}`} title={`${value}${disabled ? " (unavailable)" : ""}`} aria-label={`${group.name}: ${value}`} aria-pressed={isSelected} onClick={() => chooseOption(group.name, value)}>
            {group.name.toLowerCase() === "color" && <span style={{ backgroundColor: matching?.swatch || "#20211e" }} />}
            <span>{value}</span>
          </button>;
        })}
      </div>
    </div>)}
    <div className="product-quantity-row"><span className="detail-label">Quantity <small className="stock-note">{stock > 0 ? `${stock} available` : "Currently unavailable"}</small></span><div className="quantity-control product-quantity"><button type="button" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">-</button><span aria-live="polite">{quantity}</span><button type="button" disabled={quantity >= stock} onClick={() => setQuantity((current) => Math.min(stock, current + 1))} aria-label="Increase quantity">+</button></div></div>
    <div className="detail-actions"><AddToCartButton product={product} variantId={selected.id} quantity={quantity} /><BuyNowButton product={product} variantId={selected.id} quantity={quantity} /></div>
  </>;
}
