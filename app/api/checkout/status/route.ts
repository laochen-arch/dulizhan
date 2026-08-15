import { getCheckoutStatus } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || "";
  const paypalOrderId = url.searchParams.get("paypalOrderId") || url.searchParams.get("token") || "";
  if (!orderId || !paypalOrderId) return Response.json({ error: "orderId and paypalOrderId are required." }, { status: 400 });
  const site = await resolveSiteByHost(request.headers.get("host"));
  const status = await getCheckoutStatus(site.id, orderId, paypalOrderId);
  if (!status) return Response.json({ error: "Order status unavailable." }, { status: 404 });
  return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
