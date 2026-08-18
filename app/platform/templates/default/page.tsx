import { notFound } from "next/navigation";
import Link from "../../../components/site-link";
import { siteConfig } from "../../../data/site-config";
import { products as defaultProducts } from "../../../data/products";
import { applyPlatformTemplateVariant, getPlatformTemplate } from "../../template-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Northline Commerce starter template" };

export default async function PlatformTemplatePreviewPage({ searchParams }: { searchParams?: Promise<{ template?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const template = getPlatformTemplate(query.template || "default") || getPlatformTemplate("default");
  const snapshot = await readTemplate();
  if (!snapshot) notFound();
  const config = template ? applyPlatformTemplateVariant(snapshot.config, template.id) : snapshot.config;
  const { catalog } = snapshot;
  const featured = catalog.filter((product) => product.status === "active").slice(0, 3);
  return <main className="platform-template-preview"><div className="platform-template-preview-bar"><span>PUBLIC TEMPLATE PREVIEW / {template?.name || "Northline Commerce"}</span><div><Link href="/platform">Back to platform</Link><Link className="button button-dark" href={`/platform/apply?template=${encodeURIComponent(template?.id || "default")}`}>Use this template →</Link></div></div><section className="platform-template-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,25,40,.84), rgba(10,25,40,.14)), url(${config.assets.hero})` }}><div><p className="eyebrow eyebrow-light">{config.content.home.heroLabel}</p><h1>{config.content.home.heroTitleLead}<br /><em>{config.content.home.heroTitleAccent}</em></h1><p>{config.content.home.heroBody}</p><Link className="button button-light" href={`/platform/apply?template=${encodeURIComponent(template?.id || "default")}`}>Start with this layout →</Link></div></section><section className="platform-template-copy"><div><p className="eyebrow">What gets copied</p><h2>Structure first.<br /><em>Identity stays yours.</em></h2></div><div className="platform-template-copy-list"><p><strong>Brand system</strong><span>Logo mark, colors, typography and homepage copy can be replaced during onboarding.</span></p><p><strong>Commerce foundation</strong><span>Product discovery, detail pages, cart, checkout and account paths are ready for your catalog.</span></p><p><strong>Operations layer</strong><span>Merchant inventory, orders, campaigns and after-sales stay inside your isolated workspace.</span></p></div></section><section className="platform-template-products"><div className="platform-template-section-heading"><div><p className="eyebrow">Starter catalog</p><h2>Replace these with your products.</h2></div><span>{featured.length} sample items</span></div><div className="platform-template-product-grid">{featured.map((product) => <article key={product.id}><div className="platform-template-product-art" style={{ backgroundImage: `url(${product.image})` }} /><p className="eyebrow">{product.category}</p><h3>{product.name}</h3><span>${product.price.toFixed(2)}</span></article>)}</div></section></main>;
}

async function readTemplate() {
  try {
    const { readSnapshot } = await import("../../../../db/cms");
    return await readSnapshot("default", "published");
  } catch {
    return { config: siteConfig, catalog: defaultProducts };
  }
}
