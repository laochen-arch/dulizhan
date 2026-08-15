import { updateClientBrand } from "../../../../db/v23";
import { errorResponse, getSiteId, requireMember } from "../../cms/helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; brand?: Record<string, string>; colors?: Record<string, string>; hero?: string; contactEmail?: string; tradeEmail?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "editor");
    return Response.json({ snapshot: await updateClientBrand(siteId, { brand: payload.brand, colors: payload.colors, hero: payload.hero, contactEmail: payload.contactEmail, tradeEmail: payload.tradeEmail }, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
