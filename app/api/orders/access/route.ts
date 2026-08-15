import { getPublicOrderByAccessToken } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json(await getPublicOrderByAccessToken(site.id, token), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "This order access link is invalid or expired." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
