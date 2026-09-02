/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PUBLIC_SITE_URL?: string;
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

let lastRecoveryAttempt = 0;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

function withSecurityHeaders(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", request.headers.get("cf-ray") || crypto.randomUUID());
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api-m.paypal.com https://api-m.sandbox.paypal.com https://api.resend.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function runTenantMaintenance(env: Env) {
  if (!env.DB?.prepare) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cms_maintenance_runs (
    run_key TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    detail TEXT
  )`).run();
  const bucket = Math.floor(Date.now() / RECOVERY_INTERVAL_MS);
  const runKey = `commerce:${bucket}`;
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO cms_maintenance_runs (run_key, started_at, status) VALUES (?1, ?2, 'running')").bind(runKey, new Date().toISOString()).run();
  if (Number((claim as { meta?: { changes?: number } }).meta?.changes || 0) !== 1) return;
  try {
    const { runCommerceRecovery } = await import("../db/commerce");
    const { ensureDailyTenantBackup } = await import("../db/production");
    const { retryAbandonedCheckoutEmails } = await import("../db/v21");
    const { syncMerchantCampaignSchedules } = await import("../db/v32");
    const { runV61PlatformAutomation } = await import("../db/v61");
    const { syncPlatformWorkQueue } = await import("../db/v61-operations");
    const sites = await env.DB.prepare("SELECT id FROM cms_sites WHERE status <> 'deleted'").all<{ id: string }>();
    const outcomes: Array<{ siteId: string; errors: string[] }> = [];
    for (const site of sites.results) {
      const errors: string[] = [];
      try { await runCommerceRecovery(site.id, "system", "system@northlinesupply.com"); } catch (error) { errors.push(error instanceof Error ? error.message : "commerce recovery failed"); }
      try { await retryAbandonedCheckoutEmails(site.id); } catch (error) { errors.push(error instanceof Error ? error.message : "checkout recovery failed"); }
      try { await syncMerchantCampaignSchedules(site.id); } catch (error) { errors.push(error instanceof Error ? error.message : "campaign schedule failed"); }
      try { await ensureDailyTenantBackup(site.id); } catch (error) { errors.push(error instanceof Error ? error.message : "daily backup failed"); }
      outcomes.push({ siteId: site.id, errors });
    }
    try {
      const platform = await runV61PlatformAutomation();
      if (platform.errors.length) outcomes.push({ siteId: "platform", errors: platform.errors });
      await syncPlatformWorkQueue();
    } catch (error) {
      outcomes.push({ siteId: "platform", errors: [error instanceof Error ? error.message : "platform automation failed"] });
    }
    if (env.PUBLIC_SITE_URL) {
      try {
        const { retryFailedPlatformApplicationNotifications } = await import("../app/platform/application-notifications");
        const emailRetry = await retryFailedPlatformApplicationNotifications(env.PUBLIC_SITE_URL);
        if (emailRetry.failed) outcomes.push({ siteId: "platform-email", errors: [`${emailRetry.failed} notification retries remain failed`] });
      } catch (error) {
        outcomes.push({ siteId: "platform-email", errors: [error instanceof Error ? error.message : "platform email retry failed"] });
      }
    }
    await env.DB.prepare("UPDATE cms_maintenance_runs SET completed_at = ?1, status = ?2, detail = ?3 WHERE run_key = ?4").bind(new Date().toISOString(), outcomes.some((item) => item.errors.length) ? "partial" : "completed", JSON.stringify(outcomes), runKey).run();
    await env.DB.prepare("DELETE FROM cms_maintenance_runs WHERE started_at < ?1").bind(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).run();
  } catch (error) {
    await env.DB.prepare("UPDATE cms_maintenance_runs SET completed_at = ?1, status = 'failed', detail = ?2 WHERE run_key = ?3").bind(new Date().toISOString(), error instanceof Error ? error.message : "maintenance failed", runKey).run();
  }
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
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, request);
    }

    if (Date.now() - lastRecoveryAttempt >= RECOVERY_INTERVAL_MS) {
      lastRecoveryAttempt = Date.now();
      ctx.waitUntil(runTenantMaintenance(env));
    }
    return withSecurityHeaders(await handler.fetch(request, env, ctx), request);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await runTenantMaintenance(env);
  },
};

export default worker;
