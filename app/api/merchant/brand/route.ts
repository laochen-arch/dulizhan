import { updateClientBrand } from "../../../../db/v23";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; brand?: Record<string, string>; colors?: Record<string, string>; hero?: string; contactEmail?: string; tradeEmail?: string; navigation?: Array<{label:string;href:string}>; announcement?:Record<string,string>; home?:Record<string,string>; policies?:Record<string,string>; seo?:Record<string,string> };
    const access = await requireMerchantCapability(request, "merchant.storefront.write", payload.siteId);
    return Response.json({ snapshot: await updateClientBrand(access.site.id, { brand: payload.brand, colors: payload.colors, hero: payload.hero, contactEmail: payload.contactEmail, tradeEmail: payload.tradeEmail, navigation:payload.navigation, announcement:payload.announcement, home:payload.home, policies:payload.policies, seo:payload.seo }, access.user!.userId, access.user!.email, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
