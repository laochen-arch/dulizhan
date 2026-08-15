import { recordAbandonedCheckout } from "../../../../db/v21";
import { resolveSiteByHost } from "../../../../db/cms";

export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { const payload = await request.json() as { email?: string; cart?: unknown; subtotal?: number; currency?: string }; const site = await resolveSiteByHost(request.headers.get("host")); return Response.json(await recordAbandonedCheckout(site.id, { email: payload.email, cart: payload.cart || [], subtotal: payload.subtotal, currency: payload.currency })); } catch { return Response.json({ error: "Unable to save checkout recovery state." }, { status: 400 }); } }
