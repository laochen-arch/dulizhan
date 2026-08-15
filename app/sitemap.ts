import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const host = (await headers()).get("host") || "";
    const { readSnapshot, resolveSiteByHost } = await import("../db/cms");
    const site = await resolveSiteByHost(host); const snapshot = await readSnapshot(site.id, "published");
    const origin = `https://${host}`;
    return ["", "/shop", "/about", "/faq", "/shipping", "/orders", ...snapshot.catalog.filter((product) => product.status === "active").map((product) => `/products/${product.slug}`)].map((path) => ({ url: `${origin}${path}`, lastModified: snapshot.updatedAt, changeFrequency: "weekly", priority: path === "" ? 1 : 0.7 }));
  } catch { return []; }
}
