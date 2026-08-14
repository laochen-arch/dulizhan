import { getCmsDatabase, ensureCmsSchema, normalizeDomain, type CmsDomain } from "../../../../db/cms";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "viewer");
    const database = getCmsDatabase();
    await ensureCmsSchema(database);
    const rows = await database.prepare(`SELECT id, site_id AS siteId, hostname, status, verification_token AS verificationToken,
      verified_at AS verifiedAt, last_checked_at AS lastCheckedAt, created_at AS createdAt
      FROM cms_site_domains WHERE site_id = ?1 ORDER BY created_at DESC`).bind(siteId).all<CmsDomain>();
    return Response.json({ domains: rows.results.map((domain) => ({ ...domain, verificationToken: access.member.role === "owner" ? domain.verificationToken : undefined })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; hostname?: string };
    const siteId = getSiteId(request, payload.siteId);
    await requireMember(siteId, "owner");
    const hostname = normalizeDomain(payload.hostname);
    if (!hostname) return Response.json({ error: "Provide a valid hostname.", code: "INVALID_SITE" }, { status: 400 });
    const database = getCmsDatabase();
    await ensureCmsSchema(database);
    const domain: CmsDomain = { id: `domain_${crypto.randomUUID()}`, siteId, hostname, status: "pending", verificationToken: `verify_${crypto.randomUUID()}`, verifiedAt: null, lastCheckedAt: null, createdAt: new Date().toISOString() };
    await database.prepare(`INSERT INTO cms_site_domains (id, site_id, hostname, status, verification_token, verified_at, last_checked_at, created_at)
      VALUES (?1, ?2, ?3, 'pending', ?4, NULL, NULL, ?5) ON CONFLICT(hostname) DO UPDATE SET site_id = excluded.site_id, status = 'pending', verification_token = excluded.verification_token, last_checked_at = NULL`).bind(domain.id, siteId, hostname, domain.verificationToken, domain.createdAt).run();
    await database.prepare("UPDATE cms_sites SET domain = ?1, updated_at = ?2 WHERE id = ?3").bind(hostname, domain.createdAt, siteId).run();
    return Response.json({ domain }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
