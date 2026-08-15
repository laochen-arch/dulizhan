import { getCmsDatabase, recordAudit } from "../../../../../db/cms";
import { rotateSiteIntegrationSecrets } from "../../../../../db/site-integrations";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; oldKey?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    if (!payload.oldKey || payload.oldKey.trim().length < 32) throw new Error("CMS_OLD_SECRETS_NOT_CONFIGURED");
    const result = await rotateSiteIntegrationSecrets(siteId, payload.oldKey, access.user.userId, getCmsDatabase());
    await recordAudit(getCmsDatabase(), siteId, { userId: access.user.userId, email: access.user.email }, "integration.secrets_rotated", "integration", siteId, { migrated: result.migrated });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
