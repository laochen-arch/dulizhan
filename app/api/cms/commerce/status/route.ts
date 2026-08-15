import { getCommerceConfiguration } from "../../../../../db/commerce";
import { errorResponse, getSiteId, requireMember } from "../../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    const access = await requireMember(siteId, "editor");
    return Response.json({ siteId, configuration: await getCommerceConfiguration(siteId), webhookEndpoint: new URL("/api/paypal/webhook", request.url).toString(), role: access.member.role, environmentKeys: ["CMS_SECRETS_KEY"], scope: "site" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
