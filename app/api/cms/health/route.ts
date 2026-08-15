import { listHealthChecks, runHealthChecks } from "../../../../db/v21";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const siteId = getSiteId(request); await requireMember(siteId, "viewer"); return Response.json({ checks: await listHealthChecks(siteId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const payload = await request.json() as { siteId?: string }; const siteId = getSiteId(request, payload.siteId); await requireMember(siteId, "editor"); return Response.json({ checks: await runHealthChecks(siteId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
