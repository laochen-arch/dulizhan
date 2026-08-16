import { subscribeToNewsletter } from "../../../db/v28";
import { resolveSiteByHost } from "../../../db/cms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: string; source?: string };
    const site = await resolveSiteByHost(request.headers.get("host"));
    const result = await subscribeToNewsletter(site.id, payload.email || "", payload.source || "storefront");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "INVALID_EMAIL" ? "Enter a valid email address." : "Unable to subscribe right now. Please try again.";
    return Response.json({ error: message }, { status: 400 });
  }
}
