import { readSnapshot, resolveSiteByHost, writeDraft } from "../../../db/cms";
import { attachLiveInventoryToCatalog } from "../../../db/commerce";
import type { Product } from "../../data/products";
import type { SiteConfig } from "../../data/site-config";
import { errorResponse, getSiteId, requireMember } from "./helpers";

export const dynamic = "force-dynamic";

function isValidProduct(product: unknown): product is Product {
  if (!product || typeof product !== "object") return false;
  const value = product as Partial<Product>;
  return Boolean(value.id && value.slug && value.name && value.category && value.sku && typeof value.price === "number" && typeof value.stock === "number" && Array.isArray(value.images) && Array.isArray(value.variants));
}

function parsePayload(value: unknown): { siteId?: string; config: SiteConfig; catalog: Product[] } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as { siteId?: unknown; config?: unknown; catalog?: unknown };
  if (!payload.config || typeof payload.config !== "object" || !Array.isArray(payload.catalog)) return null;
  const config = payload.config as SiteConfig;
  if (!config.brand?.name || !config.brand?.mark || !config.theme?.colors?.ink || !config.seo?.title) return null;
  if (!payload.catalog.every(isValidProduct)) return null;
  const slugs = payload.catalog.map((product) => product.slug);
  if (new Set(slugs).size !== slugs.length) return null;
  return { siteId: typeof payload.siteId === "string" ? payload.siteId : undefined, config, catalog: payload.catalog };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "draft" ? "draft" : "published";
    const explicitSiteId = url.searchParams.get("siteId");
    const siteId = explicitSiteId && /^[a-zA-Z0-9_-]{2,80}$/.test(explicitSiteId)
      ? explicitSiteId
      : mode === "published" ? (await resolveSiteByHost(request.headers.get("host"))).id : getSiteId(request);
    const access = mode === "draft" ? await requireMember(siteId, "viewer") : null;
    let snapshot = await readSnapshot(siteId, mode, access ? { userId: access.user.userId, email: access.user.email } : undefined);
    if (mode === "published") snapshot = { ...snapshot, catalog: await attachLiveInventoryToCatalog(siteId, snapshot.catalog) };
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = parsePayload(await request.json());
    if (!payload) return Response.json({ error: "The CMS payload is missing required brand or product fields.", code: "INVALID_PAYLOAD" }, { status: 400 });
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    const result = await writeDraft(siteId, payload.config, payload.catalog, access.user.userId, access.user.email);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
