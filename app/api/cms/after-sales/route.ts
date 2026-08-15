import { listAfterSalesRequests, updateAfterSalesRequest } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { try { const siteId = getSiteId(request); await requireMember(siteId, "editor"); return Response.json({ requests: await listAfterSalesRequests(siteId, new URL(request.url).searchParams.get("status") || undefined) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request) { try { const payload = await request.json() as { siteId?: string; id?: string; status?: string; adminNote?: string }; const siteId = getSiteId(request, payload.siteId); const access = await requireMember(siteId, "editor"); if (!payload.id) throw new Error("AFTER_SALES_NOT_FOUND"); return Response.json({ request: await updateAfterSalesRequest(siteId, payload.id, payload.status || "processing", payload.adminNote || "", access.user.userId, access.user.email) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
