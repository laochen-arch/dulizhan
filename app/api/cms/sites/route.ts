import { createSiteFromTemplate, createSitesFromTemplateBatch, listSites, updateSiteIdentity } from "../../../../db/cms";
import { errorResponse, currentUser, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to manage client sites.", code: "AUTH_REQUIRED" }, { status: 401 });
    return Response.json({ sites: await listSites(user.userId, user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Sign in with ChatGPT to create client sites.", code: "AUTH_REQUIRED" }, { status: 401 });
    const payload = await request.json() as { name?: string; slug?: string; templateSiteId?: string; clients?: Array<{ name?: string; slug?: string; templateSiteId?: string }> };
    if (Array.isArray(payload.clients)) {
      if (!payload.clients.length || payload.clients.length > 20) return Response.json({ error: "Provide between 1 and 20 client sites.", code: "INVALID_SITE" }, { status: 400 });
      const entries = payload.clients.map((client) => ({ name: client.name?.trim() || "", slug: client.slug?.trim().toLowerCase() || "", templateSiteId: client.templateSiteId }));
      if (entries.some((client) => !client.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(client.slug))) return Response.json({ error: "Each client needs a name and lowercase URL slug.", code: "INVALID_SITE" }, { status: 400 });
      return Response.json(await createSitesFromTemplateBatch(entries, user.userId, user.email), { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const name = payload.name?.trim() ?? "";
    const slug = payload.slug?.trim().toLowerCase() ?? "";
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Response.json({ error: "Provide a client name and a lowercase URL slug.", code: "INVALID_SITE" }, { status: 400 });
    const site = await createSiteFromTemplate(name, slug, payload.templateSiteId || "default", user.userId, user.email);
    return Response.json({ site }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { siteId?: string; name?: string; slug?: string; domain?: string | null };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    const site = await updateSiteIdentity(siteId, { name: payload.name, slug: payload.slug, domain: payload.domain }, access.user.userId, access.user.email);
    return Response.json({ site }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
