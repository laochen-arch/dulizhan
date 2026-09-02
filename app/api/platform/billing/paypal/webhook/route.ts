import { processPlatformPayPalWebhook, verifyPlatformPayPalWebhook } from "../../../../../../db/v61";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.text();
  try {
    const event = JSON.parse(payload) as { id?: string; event_type?: string; create_time?: string; resource?: Record<string, unknown> };
    if (!event.id || !event.event_type) return Response.json({ error: "Invalid PayPal webhook payload." }, { status: 400 });
    if (!await verifyPlatformPayPalWebhook(payload, request.headers)) return Response.json({ error: "Invalid PayPal webhook signature." }, { status: 400 });
    return Response.json({ received: true, result: await processPlatformPayPalWebhook({ id: event.id, event_type: event.event_type, create_time: event.create_time, resource: event.resource }) });
  } catch (error) {
    return Response.json({ error: "Platform PayPal webhook processing failed.", code: error instanceof Error ? error.message : "WEBHOOK_FAILED" }, { status: 500 });
  }
}
