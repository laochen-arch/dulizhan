import { retryDuePaymentEvents } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { const payload = await request.json().catch(() => ({})) as { siteId?: string }; const siteId = getSiteId(request, payload.siteId); const access = await requireMember(siteId, "editor"); return Response.json(await retryDuePaymentEvents(siteId, access.user.userId, access.user.email), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
