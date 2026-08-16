import { getChatGPTUser } from "../../../chatgpt-auth";
import { getPublicAccountSite } from "../helpers";
import { getStorefrontAccess } from "../../../../db/v25";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const site = await getPublicAccountSite(request);
    const user = await getChatGPTUser();
    return Response.json({ access: await getStorefrontAccess(site.id, user ? { userId: user.userId, email: user.email, displayName: user.displayName } : undefined) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The storefront access service is unavailable.", code: "ACCESS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
