import { getChatGPTUser } from "../../../chatgpt-auth";
import { createSiteFromTemplate, findMember } from "../../../../db/cms";
import {
  applyPlatformApplicationToSite,
  createPlatformApplication,
  getPlatformApplication,
  getPlatformApplicationForAccess,
  listPlatformApplicationAssets,
  listPlatformApplicationEvents,
  listPlatformApplications,
  listPlatformDomainRequests,
  listPlatformSupportTickets,
  updatePlatformApplication,
} from "../../../../db/v32";
import { upsertMerchantMember } from "../../../../db/v25";
import { attachPlatformReferral, getPlatformCommercialSnapshot, getPlatformPlan, getReferralCodeSummary, qualifyPlatformReferral, selectPlatformPlan } from "../../../../db/v34";
import { applicationAccessCookieName } from "../application-access";

export const dynamic = "force-dynamic";

function responseError(message: string, status = 400, code = "PLATFORM_APPLICATION_ERROR", extra?: Record<string, unknown>) {
  return Response.json({ error: message, code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "merchant-store";
}

async function isPlatformOwner() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const member = await findMember("default", user.userId, user.email);
  return member?.role === "owner" ? user : null;
}

async function resolveApplicantApplication(id: string, token: string | null, user: Awaited<ReturnType<typeof getChatGPTUser>>) {
  if (token) return getPlatformApplicationForAccess(id, token);
  if (!user) return null;
  const application = await getPlatformApplication(id);
  if (!application) return null;
  return application.userId === user.userId || application.email.toLowerCase() === user.email.toLowerCase() ? application : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || url.searchParams.get("application");
    const token = url.searchParams.get("token");
    const user = await getChatGPTUser();
    const owner = await isPlatformOwner();
    if (id) {
      const application = owner ? await getPlatformApplication(id) : await resolveApplicantApplication(id, token, user);
      if (!application) return responseError(token ? "This application link is invalid or expired." : "You do not have access to this application.", token ? 401 : 403, token ? "INVALID_APPLICATION_ACCESS" : "FORBIDDEN");
      const response = Response.json({ application, events: await listPlatformApplicationEvents(id), domains: await listPlatformDomainRequests(id), assets: await listPlatformApplicationAssets(id), tickets: await listPlatformSupportTickets(id), commercial: await getPlatformCommercialSnapshot(id), canReview: Boolean(owner) }, { headers: { "Cache-Control": "no-store" } });
      if (token && !owner) response.headers.set("Set-Cookie", `${applicationAccessCookieName(id)}=${encodeURIComponent(token)}; Path=/api/platform/applications; Max-Age=7776000; HttpOnly; SameSite=Lax; Secure`);
      return response;
    }
    if (!user) return responseError("Sign in with ChatGPT or open the secure application link to view status.", 401, "AUTH_REQUIRED");
    return Response.json({ applications: await listPlatformApplications(owner ? {} : { userId: user.userId, email: user.email }), canReview: Boolean(owner) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Unable to load applications.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const planId = typeof payload.planId === "string" ? payload.planId : "";
    const referralCode = typeof payload.referralCode === "string" ? payload.referralCode : "";
    if (planId && !await getPlatformPlan(planId)) return responseError("请选择有效的平台套餐。", 400, "PLAN_NOT_FOUND");
    if (referralCode && !await getReferralCodeSummary(referralCode)) return responseError("推荐码无效或已停用。", 400, "REFERRAL_CODE_INVALID");
    const result = await createPlatformApplication({ ...payload, userId: user?.userId || null, email: typeof payload.email === "string" ? payload.email : user?.email });
    const actor = { userId: user?.userId || `application:${result.application.id}`, email: result.application.email, role: "applicant" as const };
    if (planId) await selectPlatformPlan(result.application.id, planId, payload.billingInterval === "annual" ? "annual" : "monthly", actor);
    if (referralCode) await attachPlatformReferral(result.application.id, referralCode, actor);
    return Response.json({ ...result, application: await getPlatformApplication(result.application.id), commercial: await getPlatformCommercialSnapshot(result.application.id) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unable to submit the merchant application.";
    if (raw.startsWith("DUPLICATE_APPLICATION:")) return responseError("已有一条处理中申请，请直接查看申请进度。", 409, "DUPLICATE_APPLICATION", { applicationId: raw.split(":")[1] });
    if (raw === "AGREEMENT_REQUIRED") return responseError("请先确认服务条款、隐私政策和平台入驻协议。", 400, raw);
    if (raw === "SITE_REQUIRED_FOR_CREATED_STATUS") return responseError("只有已绑定独立站的申请才能标记为“站点已创建”。", 409, raw);
    if (raw === "INVALID_STATUS_TRANSITION") return responseError("申请当前状态不允许直接切换到该状态。", 409, raw);
    return responseError(raw === "INVALID_APPLICATION" ? "请检查必填资料、邮箱、手机号、网址和品牌色。" : raw, 400, raw);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      id?: string;
      token?: string;
      status?: string;
      assignedSiteId?: string | null;
      adminNote?: string | null;
      createSite?: boolean;
      applicantType?: string;
      contactName?: string;
      phone?: string | null;
      companyName?: string;
      brandName?: string;
      category?: string;
      website?: string | null;
      targetDomain?: string | null;
      markets?: string | null;
      productSource?: string | null;
      notes?: string | null;
      templateSiteId?: string;
      brandLogoUrl?: string | null;
      brandPrimaryColor?: string | null;
      homeCopy?: string | null;
      productImport?: unknown;
      locale?: string;
      referralCode?: string | null;
    };
    if (!payload.id) return responseError("Application id is required.");
    const owner = await isPlatformOwner();
    const user = await getChatGPTUser();
    const current = owner ? await getPlatformApplication(payload.id) : await resolveApplicantApplication(payload.id, payload.token || null, user);
    if (!current) return responseError("The application was not found or is not accessible.", 404, "APPLICATION_NOT_FOUND");
    if (!owner) {
      const application = await updatePlatformApplication(payload.id, {
        status: "submitted",
        applicantType: payload.applicantType,
        contactName: payload.contactName,
        phone: payload.phone,
        companyName: payload.companyName,
        brandName: payload.brandName,
        category: payload.category,
        website: payload.website,
        targetDomain: payload.targetDomain,
        markets: payload.markets,
        productSource: payload.productSource,
        notes: payload.notes,
        templateSiteId: payload.templateSiteId,
        brandLogoUrl: payload.brandLogoUrl,
        brandPrimaryColor: payload.brandPrimaryColor,
        homeCopy: payload.homeCopy,
        productImport: payload.productImport,
        locale: payload.locale,
        referralCode: payload.referralCode,
      }, { userId: user?.userId || `application:${current.id}`, email: user?.email || current.email, role: "applicant" });
      return Response.json({ application }, { headers: { "Cache-Control": "no-store" } });
    }
    let assignedSiteId = payload.assignedSiteId;
    let status = payload.status;
    if (payload.createSite || (payload.status === "approved" && !current.assignedSiteId)) {
      if (current.assignedSiteId) {
        assignedSiteId = current.assignedSiteId;
        status = "site_created";
        try {
          await applyPlatformApplicationToSite(current.id, current.assignedSiteId, owner.userId, owner.email);
        } catch {
          await updatePlatformApplication(current.id, { status: "approved", assignedSiteId: current.assignedSiteId, adminNote: "Storefront exists. Onboarding materials need another retry from the platform team." }, { userId: owner.userId, email: owner.email, role: "platform" });
          return responseError("站点已存在，但预配置资料暂未应用成功，请检查资料后重试。", 502, "ONBOARDING_APPLY_FAILED");
        }
      } else {
        const created = await createSiteFromTemplate(current.brandName || current.companyName, `${slugify(current.brandName || current.companyName)}-${current.id.slice(-6)}`, current.templateSiteId || "default", owner.userId, owner.email);
        assignedSiteId = created.id;
        status = "site_created";
        await upsertMerchantMember(created.id, { userId: current.userId || `applicant:${current.email}`, email: current.email, role: "merchant_owner" }, "invited");
        try {
          await applyPlatformApplicationToSite(current.id, created.id, owner.userId, owner.email);
        } catch {
          await updatePlatformApplication(current.id, { status: "approved", assignedSiteId: created.id, adminNote: "Storefront created. Onboarding materials need a retry from the platform team." }, { userId: owner.userId, email: owner.email, role: "platform" });
          return responseError("站点已创建，但预配置资料暂未应用成功，请稍后重试。", 502, "ONBOARDING_APPLY_FAILED");
        }
      }
    }
    const application = await updatePlatformApplication(payload.id, { status, assignedSiteId, adminNote: payload.adminNote }, { userId: owner.userId, email: owner.email, role: "platform" });
    if (application && ["approved", "site_created"].includes(application.status)) await qualifyPlatformReferral(application.id, { userId: owner.userId, email: owner.email, role: "platform" });
    return Response.json({ application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the application.";
    const status = message === "APPLICATION_NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : ["INVALID_STATUS_TRANSITION", "SITE_REQUIRED_FOR_CREATED_STATUS"].includes(message) ? 409 : 400;
    return responseError(message, status, message);
  }
}
