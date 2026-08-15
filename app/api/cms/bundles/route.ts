import { listBundles, saveBundle } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const siteId = getSiteId(request); await requireMember(siteId, "viewer"); return Response.json({ bundles: await listBundles(siteId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const payload = await request.json() as { siteId?: string; id?: string; name?: string; slug?: string; productIds?: string[]; discountType?: string; discountValue?: number; active?: boolean }; const siteId = getSiteId(request, payload.siteId); const access = await requireMember(siteId, "editor"); return Response.json({ bundles: await saveBundle(siteId, payload, access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
