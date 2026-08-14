import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductPurchase } from "../../components/product-actions";
import { ProductCard } from "../../components/product-card";
import { getProduct, products } from "../../data/products";

export function generateStaticParams() { return products.map((product) => ({ slug: product.slug })); }

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getProduct(params.slug);
  return product ? { title: product.name, description: product.description } : {};
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProduct(params.slug);
  if (!product) notFound();
  const related = products.filter((item) => item.id !== product.id && item.category === product.category).slice(0, 2);

  return <div className="product-page container section-pad"><div className="breadcrumbs"><a href="/shop">Shop</a><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div><div className="product-detail"><div className="detail-image-wrap"><span className="product-badge">{product.badge || "Northline essential"}</span><img src={product.image} alt={product.alt} className="detail-image" /></div><div className="detail-copy"><p className="eyebrow">{product.category} / Northline Supply</p><h1>{product.name}</h1><p className="detail-description">{product.details}</p><div className="detail-divider" /><ProductPurchase product={product} /><div className="detail-accordions"><details open><summary>Details <span>+</span></summary><p>{product.details}</p></details><details><summary>Specifications <span>+</span></summary><ul>{product.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul></details><details><summary>Shipping & returns <span>+</span></summary><p>Free US shipping over $100. Returns accepted within 30 days of delivery. <a href="/shipping">Read the full policy →</a></p></details></div></div></div><section className="related-products"><div className="section-heading"><div><p className="eyebrow">Keep exploring</p><h2>More for the<br /><em>same kind of day.</em></h2></div></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section></div>;
}
