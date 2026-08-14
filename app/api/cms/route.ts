import { getChatGPTUser } from "../../chatgpt-auth";
import { readCmsSnapshot, writeCmsSnapshot } from "../../../db/cms";
import type { Product } from "../../data/products";
import type { SiteConfig } from "../../data/site-config";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number, code?: string) {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

function isValidProduct(product: unknown): product is Product {
  if (!product || typeof product !== "object") return false;
  const value = product as Partial<Product>;
  return Boolean(
    value.id &&
      value.slug &&
      value.name &&
      value.category &&
      value.sku &&
      typeof value.price === "number" &&
      typeof value.stock === "number" &&
      Array.isArray(value.images) &&
      Array.isArray(value.variants),
  );
}

function parsePayload(value: unknown): { config: SiteConfig; catalog: Product[] } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as { config?: unknown; catalog?: unknown };
  if (!payload.config || typeof payload.config !== "object" || !Array.isArray(payload.catalog)) return null;
  const config = payload.config as SiteConfig;
  if (!config.brand?.name || !config.brand?.mark || !config.theme?.colors?.ink || !config.seo?.title) return null;
  if (!payload.catalog.every(isValidProduct)) return null;
  const slugs = payload.catalog.map((product) => product.slug);
  if (new Set(slugs).size !== slugs.length) return null;
  return { config, catalog: payload.catalog };
}

export async function GET() {
  try {
    const snapshot = await readCmsSnapshot();
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CMS is unavailable";
    return jsonError(message, 503, "CMS_UNAVAILABLE");
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in with ChatGPT to manage this storefront.", 401, "AUTH_REQUIRED");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The CMS payload must be valid JSON.", 400, "INVALID_JSON");
  }

  const parsed = parsePayload(payload);
  if (!parsed) return jsonError("The CMS payload is missing required brand or product fields.", 400, "INVALID_PAYLOAD");

  try {
    const result = await writeCmsSnapshot(parsed.config, parsed.catalog, user.userId);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CMS save failed";
    return jsonError(message, 500, "CMS_WRITE_FAILED");
  }
}
