import { getPublicOrderByNumber } from "../../../../db/commerce";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  try {
    const key = `${request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "anonymous"}:${new URL(request.url).host}`;
    const current = attempts.get(key); const timestamp = Date.now();
    const windowed = !current || current.resetAt <= timestamp ? { count: 0, resetAt: timestamp + 5 * 60 * 1000 } : current;
    windowed.count += 1; attempts.set(key, windowed);
    if (windowed.count > 10) return Response.json({ error: "Too many lookup attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": "300" } });
    const payload = await request.json() as { orderNumber?: string; email?: string };
    if (!payload.orderNumber?.trim() || !payload.email?.trim()) return Response.json({ error: "Order number and email are required." }, { status: 400 });
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json(await getPublicOrderByNumber(site.id, payload.orderNumber, payload.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "ORDER_NOT_FOUND" ? "We could not find an order with those details." : "Unable to look up this order right now.";
    return Response.json({ error: message }, { status: error instanceof Error && error.message === "ORDER_NOT_FOUND" ? 404 : 500 });
  }
}
