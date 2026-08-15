/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const { expirePendingOrders, retryDueOrderNotifications, retryDuePaymentEvents, reconcilePayPalOrders } = await import("../db/commerce");
    const { retryAbandonedCheckoutEmails } = await import("../db/v21");
    const sites = await env.DB.prepare("SELECT id FROM cms_sites WHERE status <> 'deleted'").all<{ id: string }>();
    await Promise.all(sites.results.map(async (site) => {
      try { await expirePendingOrders(site.id); } catch { /* keep the remaining tenant jobs running */ }
      try { await retryDueOrderNotifications(site.id, "system", "system@northlinesupply.com"); } catch { /* traced by notification records */ }
      try { await retryDuePaymentEvents(site.id, "system", "system@northlinesupply.com"); } catch { /* traced by payment records */ }
      try { await reconcilePayPalOrders(site.id, "system", "system@northlinesupply.com"); } catch { /* provider may be unconfigured in draft */ }
      try { await retryAbandonedCheckoutEmails(site.id); } catch { /* traced by checkout recovery status */ }
    }));
  },
};

export default worker;
