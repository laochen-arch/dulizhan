import { listBundles, listCoupons, saveBundle, saveCoupon, updateCouponWindow } from "../../../../db/v21";
import { cancelMerchantCampaignSchedule, getMerchantMarketing, saveMerchantCampaignSchedule, saveMerchantCollection, saveMerchantRecommendation } from "../../../../db/v32";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "marketing.read");
    const [coupons, bundles, marketing] = await Promise.all([listCoupons(access.site.id), listBundles(access.site.id), getMerchantMarketing(access.site.id)]);
    return Response.json({ coupons, bundles, ...marketing }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; type?: "coupon" | "bundle" | "collection" | "recommendation" | "schedule"; id?: string; code?: string; discountType?: "fixed" | "percent"; discountValue?: number; minSubtotal?: number; maxUses?: number | null; active?: boolean; name?: string; slug?: string; description?: string; productIds?: string[]; sortOrder?: number; strategy?: string; sourceProductId?: string; category?: string; startsAt?: string; endsAt?: string | null; targetType?: string; targetId?: string };
    const access = await requireMerchantCapability(request, "marketing.write", payload.siteId);
    if (payload.type === "collection") return Response.json({ collections: await saveMerchantCollection(access.site.id, payload, access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
    if (payload.type === "recommendation") return Response.json({ recommendations: await saveMerchantRecommendation(access.site.id, payload, access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
    if (payload.type === "schedule") return Response.json({ schedules: await saveMerchantCampaignSchedule(access.site.id, payload, access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
    if (payload.type === "bundle") {
      return Response.json({ bundles: await saveBundle(access.site.id, payload, access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (payload.type !== "coupon") throw new Error("INVALID_COUPON");
    await saveCoupon(access.site.id, payload, access.user!.userId, access.user!.email);
    const coupons = payload.startsAt !== undefined || payload.endsAt !== undefined ? await updateCouponWindow(access.site.id, payload.code || "", payload.startsAt || null, payload.endsAt || null, access.user!.userId, access.user!.email) : await listCoupons(access.site.id);
    return Response.json({ coupons }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; id?: string };
    const access = await requireMerchantCapability(request, "marketing.write", payload.siteId);
    if (!payload.id) throw new Error("INVALID_SCHEDULE");
    return Response.json({ schedules: await cancelMerchantCampaignSchedule(access.site.id, payload.id, access.user!.userId, access.user!.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
