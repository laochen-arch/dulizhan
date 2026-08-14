"use client";

import { useState } from "react";
import type { Product } from "../data/products";

export function ProductGallery({ product }: { product: Product }) {
  const images = product.images.length ? product.images : [product.image];
  const [activeIndex, setActiveIndex] = useState(0);
  const previous = () => setActiveIndex((index) => (index - 1 + images.length) % images.length);
  const next = () => setActiveIndex((index) => (index + 1) % images.length);
  return (
    <div className="detail-gallery" aria-label={`${product.name} product images`}>
      <div className="detail-image-wrap">
        <span className="product-badge">{product.badge || "Northline essential"}</span>
        <img src={images[activeIndex]} alt={product.alt} className="detail-image" />
        {images.length > 1 && <div className="gallery-controls"><button type="button" onClick={previous} aria-label="Previous product image">←</button><span aria-live="polite">{activeIndex + 1} / {images.length}</span><button type="button" onClick={next} aria-label="Next product image">→</button></div>}
      </div>
      {images.length > 1 && <div className="detail-thumbnails" role="list" aria-label="Choose product image">{images.map((image, index) => <button type="button" key={`${image}-${index}`} className={index === activeIndex ? "is-active" : ""} onClick={() => setActiveIndex(index)} aria-label={`View product image ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined}><img src={image} alt="" /></button>)}</div>}
    </div>
  );
}
