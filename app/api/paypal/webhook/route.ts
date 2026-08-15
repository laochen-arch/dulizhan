import { processPayPalEvent, verifyPayPalWebhook } from "../../../../db/commerce";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.text();
  if (!(await verifyPayPalWebhook(payload, request.headers))) return Response.json({ error: "Invalid PayPal webhook signature." }, { status: 400 });
  try {
    const event = JSON.parse(payload) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
    if (!event.id || !event.event_type) return Response.json({ error: "Invalid PayPal webhook payload." }, { status: 400 });
    return Response.json({ received: true, ...(await processPayPalEvent({ id: event.id, event_type: event.event_type, resource: event.resource })) });
  } catch {
    return Response.json({ error: "PayPal webhook processing failed." }, { status: 500 });
  }
}
