import { getCommerceConfiguration } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    return Response.json({ siteId, configuration: getCommerceConfiguration(), webhookEndpoint: new URL("/api/stripe/webhook", request.url).toString(), role: access.member.role, environmentKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "RESEND_FROM_EMAIL"] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
