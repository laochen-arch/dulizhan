import { getCmsDatabase, recordAudit } from "../../../../db/cms";
import { getSiteIntegrationStatuses, saveSiteIntegration, type SiteIntegrationProvider } from "../../../../db/site-integrations";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.settings.read");
    return Response.json({ siteId: access.site.id, integrations: await getSiteIntegrationStatuses(access.site.id), role: access.member.role }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; provider?: SiteIntegrationProvider; clientId?: string; clientSecret?: string; webhookId?: string; environment?: string; apiKey?: string; fromEmail?: string };
    const access = await requireMerchantCapability(request, "merchant.settings.write", payload.siteId);
    if (payload.provider !== "paypal" && payload.provider !== "resend") throw new Error("INVALID_INTEGRATION");
    const integrations = await saveSiteIntegration(access.site.id, payload.provider, payload, access.user!.userId);
    await recordAudit(getCmsDatabase(), access.site.id, { userId: access.user!.userId, email: access.user!.email }, "integration.updated", "integration", payload.provider, { provider: payload.provider, encrypted: true, source: "merchant" });
    return Response.json({ siteId: access.site.id, integrations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
