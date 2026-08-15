import { listBundles } from "../../../db/v21";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { const site = await resolveSiteByHost(request.headers.get("host")); return Response.json({ bundles: await listBundles(site.id, true) }, { headers: { "Cache-Control": "no-store" } }); }
