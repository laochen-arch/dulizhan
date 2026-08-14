import type { Metadata } from "next";
import { ProductDetailView } from "./product-detail-view";
import { activeProducts, getActiveProduct } from "../../data/products";

export const dynamicParams = true;

export function generateStaticParams() { return activeProducts.map((product) => ({ slug: product.slug })); }

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getActiveProduct(params.slug);
  return product ? { title: product.name, description: product.description } : { title: "Product" };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  return <ProductDetailView slug={params.slug} fallback={getActiveProduct(params.slug) ?? null} />;
}
