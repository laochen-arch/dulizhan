import { recordAnalyticsEvent } from "../../../db/v21";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { eventType?: string; productId?: string; orderId?: string; sessionId?: string; payload?: Record<string, unknown> };
    const site = await resolveSiteByHost(request.headers.get("host"));
    return Response.json(await recordAnalyticsEvent(site.id, { eventType: payload.eventType || "", productId: payload.productId, orderId: payload.orderId, sessionId: payload.sessionId, payload: payload.payload }));
  } catch { return Response.json({ error: "Analytics event rejected." }, { status: 400 }); }
}
