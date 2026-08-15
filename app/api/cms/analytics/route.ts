import { getAnalyticsSummary } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const siteId = getSiteId(request); const access = await requireMember(siteId, "viewer"); return Response.json({ analytics: await getAnalyticsSummary(siteId, Number(new URL(request.url).searchParams.get("days") || 30)), role: access.member.role }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
