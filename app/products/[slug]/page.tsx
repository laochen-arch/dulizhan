import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProductDetailView } from "./product-detail-view";
import { activeProducts, getActiveProduct } from "../../data/products";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export function generateStaticParams() { return activeProducts.map((product) => ({ slug: product.slug })); }

async function getPublishedProduct(slug: string) {
  try {
    const [{ attachLiveInventoryToCatalog }, { readSnapshot, resolveSiteByHost }] = await Promise.all([
      import("../../../db/commerce"),
      import("../../../db/cms"),
    ]);
    const requestHeaders = await headers();
    const site = await resolveSiteByHost(requestHeaders.get("host"));
    const snapshot = await readSnapshot(site.id, "published");
    const catalog = await attachLiveInventoryToCatalog(site.id, snapshot.catalog);
    return catalog.find((product) => product.slug === slug && product.status === "active") ?? null;
  } catch {
    return getActiveProduct(slug) ?? null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getPublishedProduct(params.slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description,
      type: "website",
      images: product.images.length ? product.images : [product.image],
    },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getPublishedProduct(params.slug);
  if (!product) notFound();
  return <ProductDetailView slug={params.slug} fallback={product} />;
}
