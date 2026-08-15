import { getCmsDatabase, recordAudit } from "../../../../db/cms";
import { getSiteIntegrationStatuses, saveSiteIntegration, type SiteIntegrationProvider } from "../../../../db/site-integrations";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    return Response.json({ siteId, integrations: await getSiteIntegrationStatuses(siteId), role: access.member.role, environmentKeys: ["CMS_SECRETS_KEY"] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; provider?: SiteIntegrationProvider; clientId?: string; clientSecret?: string; webhookId?: string; environment?: string; apiKey?: string; fromEmail?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    if (payload.provider !== "paypal" && payload.provider !== "resend") throw new Error("INVALID_INTEGRATION");
    const integrations = await saveSiteIntegration(siteId, payload.provider, payload, access.user.userId);
    await recordAudit(getCmsDatabase(), siteId, { userId: access.user.userId, email: access.user.email }, "integration.updated", "integration", payload.provider, { provider: payload.provider, encrypted: true });
    return Response.json({ siteId, integrations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
