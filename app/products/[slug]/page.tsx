import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGallery } from "../../components/product-gallery";
import { ProductPurchase } from "../../components/product-actions";
import { ProductCard } from "../../components/product-card";
import { activeProducts, getActiveProduct } from "../../data/products";

export function generateStaticParams() { return activeProducts.map((product) => ({ slug: product.slug })); }

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getActiveProduct(params.slug);
  return product ? { title: product.name, description: product.description } : {};
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getActiveProduct(params.slug);
  if (!product) notFound();
  const related = activeProducts.filter((item) => item.id !== product.id && (product.relatedSlugs.includes(item.slug) || item.category === product.category)).slice(0, 2);

  return <div className="product-page container section-pad"><div className="breadcrumbs"><a href="/shop">Shop</a><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div><div className="product-detail"><ProductGallery product={product} /><div className="detail-copy"><p className="eyebrow">{product.category} / Northline Supply</p><h1>{product.name}</h1><p className="detail-description">{product.details}</p><div className="detail-divider" /><ProductPurchase product={product} /><div className="detail-accordions"><details open><summary>Details <span>+</span></summary><p>{product.details}</p></details><details><summary>Specifications <span>+</span></summary><ul>{product.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul></details><details><summary>Shipping & returns <span>+</span></summary><p>Free US shipping over $100. Returns accepted within 30 days of delivery. <a href="/shipping">Read the full policy -&gt;</a></p></details></div></div></div><section className="related-products"><div className="section-heading"><div><p className="eyebrow">Keep exploring</p><h2>More for the<br /><em>same kind of day.</em></h2></div></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section></div>;
}
