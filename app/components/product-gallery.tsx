"use client";

import { useState } from "react";
import type { Product } from "../data/products";

export function ProductGallery({ product }: { product: Product }) {
  const images = product.images.length ? product.images : [product.image];
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <div className="detail-gallery">
      <div className="detail-image-wrap">
        <span className="product-badge">{product.badge || "Northline essential"}</span>
        <img src={images[activeIndex]} alt={product.alt} className="detail-image" />
      </div>
      {images.length > 1 && <div className="detail-thumbnails" aria-label="Product images">{images.map((image, index) => <button type="button" key={`${image}-${index}`} className={index === activeIndex ? "is-active" : ""} onClick={() => setActiveIndex(index)} aria-label={`View product image ${index + 1}`}><img src={image} alt="" /></button>)}</div>}
    </div>
  );
}
