import { getCheckoutStatus } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || "";
  const sessionId = url.searchParams.get("sessionId") || "";
  if (!orderId || !sessionId) return Response.json({ error: "orderId and sessionId are required." }, { status: 400 });
  const site = await resolveSiteByHost(request.headers.get("host"));
  const status = await getCheckoutStatus(site.id, orderId, sessionId);
  if (!status) return Response.json({ error: "Order status unavailable." }, { status: 404 });
  return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
