"use client";

import { useEffect, useState } from "react";
import type { Product } from "../data/products";

export function ProductGallery({ product }: { product: Product }) {
  const images = product.images.length ? product.images : [product.image];
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const previous = () => setActiveIndex((index) => (index - 1 + images.length) % images.length);
  const next = () => setActiveIndex((index) => (index + 1) % images.length);
  useEffect(() => {
    if (!zoomOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [zoomOpen]);
  return (
    <div className="detail-gallery" aria-label={`${product.name} product images`}>
      <div className="detail-image-wrap">
        <span className="product-badge">{product.badge || "Essential"}</span>
        <button type="button" className="detail-image-button" onClick={() => setZoomOpen(true)} aria-label={`Zoom ${product.name} image`}><img src={images[activeIndex]} alt={product.alt} className="detail-image" fetchPriority="high" decoding="async" sizes="(max-width: 800px) 100vw, 52vw" /></button>
        {images.length > 1 && <div className="gallery-controls"><button type="button" onClick={previous} aria-label="Previous product image">←</button><span aria-live="polite">{activeIndex + 1} / {images.length}</span><button type="button" onClick={next} aria-label="Next product image">→</button></div>}
      </div>
      {images.length > 1 && <div className="detail-thumbnails" role="list" aria-label="Choose product image">{images.map((image, index) => <button type="button" key={`${image}-${index}`} className={index === activeIndex ? "is-active" : ""} onClick={() => setActiveIndex(index)} aria-label={`View product image ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined}><img src={image} alt="" loading="lazy" decoding="async" sizes="88px" /></button>)}</div>}
      {zoomOpen && <div className="gallery-zoom-layer" role="dialog" aria-modal="true" aria-label={`${product.name} enlarged image`}><button type="button" className="gallery-zoom-backdrop" onClick={() => setZoomOpen(false)} aria-label="Close enlarged image" /><div className="gallery-zoom-content"><button type="button" className="gallery-zoom-close" onClick={() => setZoomOpen(false)} aria-label="Close enlarged image">×</button><img src={images[activeIndex]} alt={product.alt} decoding="async" /></div></div>}
    </div>
  );
}
