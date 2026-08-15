import { ensureCmsSchema, getCmsDatabase, normalizeDomain, type CmsDomain } from "../../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; domainId?: string };
    const siteId = getSiteId(request, payload.siteId);
    await requireMember(siteId, "editor");
    const database = getCmsDatabase();
    await ensureCmsSchema(database);
    const row = await database.prepare(`SELECT id, site_id AS siteId, hostname, status, verification_token AS verificationToken,
      verified_at AS verifiedAt, last_checked_at AS lastCheckedAt, created_at AS createdAt
      FROM cms_site_domains WHERE site_id = ?1 AND (?2 = '' OR id = ?2) ORDER BY created_at DESC LIMIT 1`).bind(siteId, payload.domainId || "").first<CmsDomain>();
    if (!row) return Response.json({ error: "The requested custom domain was not found.", code: "DOMAIN_NOT_FOUND" }, { status: 404 });

    const checkedAt = new Date().toISOString();
    const requestHost = normalizeDomain(new URL(request.url).hostname);
    const hostnameMatches = requestHost === row.hostname || requestHost === `www.${row.hostname}` || row.hostname === `www.${requestHost}`;
    const status = hostnameMatches ? "active" : row.status === "active" ? "active" : "pending";
    const verifiedAt = hostnameMatches ? row.verifiedAt || checkedAt : row.verifiedAt;
    await database.prepare(`UPDATE cms_site_domains SET status = ?1, verified_at = ?2, last_checked_at = ?3 WHERE id = ?4 AND site_id = ?5`)
      .bind(status, verifiedAt, checkedAt, row.id, siteId).run();
    return Response.json({
      domain: { ...row, status, verifiedAt, lastCheckedAt: checkedAt },
      confirmed: hostnameMatches,
      detail: hostnameMatches
        ? "This request reached the custom hostname. DNS and routing are responding."
        : "The request is running on the preview host. Configure the custom domain in Sites and point DNS, then check again from the customer hostname.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
