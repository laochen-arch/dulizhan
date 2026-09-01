import { subscribeToNewsletter, unsubscribeFromNewsletter } from "../../../db/v28";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: string; source?: string };
    const site = await resolveSiteByHost(request.headers.get("host"));
    const result = await subscribeToNewsletter(site.id, payload.email || "", payload.source || "storefront", new URL(request.url).origin);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "INVALID_EMAIL" ? "Enter a valid email address." : "Unable to subscribe right now. Please try again.";
    return Response.json({ error: message }, { status: 400 });
  }
}


export async function DELETE(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { email?: string; token?: string };
    const site = await resolveSiteByHost(request.headers.get("host"));
    const result = await unsubscribeFromNewsletter(site.id, payload);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Enter a valid email address or use the unsubscribe link from your email." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
