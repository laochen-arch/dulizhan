import { processStripeEvent, verifyStripeSignature } from "../../../../db/commerce";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get("stripe-signature")))) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  try {
    const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    if (!event.id || !event.type) return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
    return Response.json({ received: true, ...(await processStripeEvent({ id: event.id, type: event.type, data: event.data })) });
  } catch {
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
