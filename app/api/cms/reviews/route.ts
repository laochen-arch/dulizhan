import { listReviewsForAdmin, moderateReview } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const siteId = getSiteId(request); await requireMember(siteId, "viewer"); return Response.json({ reviews: await listReviewsForAdmin(siteId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request) { try { const payload = await request.json() as { siteId?: string; id?: string; status?: string }; const siteId = getSiteId(request, payload.siteId); const access = await requireMember(siteId, "editor"); if (!payload.id) throw new Error("REVIEW_NOT_FOUND"); return Response.json({ reviews: await moderateReview(siteId, payload.id, payload.status || "approved", access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
