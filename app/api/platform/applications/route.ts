import { getChatGPTUser } from "../../../chatgpt-auth";
import { createSiteFromTemplate, findMember } from "../../../../db/cms";
import { getPlatformApplication, listPlatformApplications, createPlatformApplication, updatePlatformApplication } from "../../../../db/v32";
import { upsertMerchantMember } from "../../../../db/v25";

export const dynamic = "force-dynamic";

function responseError(message: string, status = 400, code = "PLATFORM_APPLICATION_ERROR") {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
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

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return responseError("Sign in with ChatGPT to view application status.", 401, "AUTH_REQUIRED");
    const owner = await isPlatformOwner();
    return Response.json({ applications: await listPlatformApplications(owner ? {} : { userId: user.userId, email: user.email }), canReview: Boolean(owner) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Unable to load applications.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const application = await createPlatformApplication({ ...payload, userId: user?.userId || null, email: typeof payload.email === "string" ? payload.email : user?.email });
    return Response.json({ application }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit the merchant application.";
    return responseError(message === "INVALID_APPLICATION" ? "Complete the required merchant details before submitting." : message, 400, message);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await isPlatformOwner();
    if (!owner) return responseError("Only platform operators can review merchant applications.", 403, "FORBIDDEN");
    const payload = await request.json().catch(() => ({})) as { id?: string; status?: string; assignedSiteId?: string | null; adminNote?: string | null; createSite?: boolean };
    if (!payload.id) return responseError("Application id is required.");
    const current = await getPlatformApplication(payload.id);
    if (!current) return responseError("The application was not found.", 404, "APPLICATION_NOT_FOUND");
    let assignedSiteId = payload.assignedSiteId;
    let status = payload.status;
    if (payload.createSite || (payload.status === "approved" && !current.assignedSiteId)) {
      const created = await createSiteFromTemplate(current.brandName || current.companyName, `${slugify(current.brandName || current.companyName)}-${current.id.slice(-6)}`, "default", owner.userId, owner.email);
      assignedSiteId = created.id;
      status = "site_created";
      await upsertMerchantMember(created.id, { userId: current.userId || `applicant:${current.email}`, email: current.email, role: "merchant_owner" }, "invited");
    }
    return Response.json({ application: await updatePlatformApplication(payload.id, { status, assignedSiteId, adminNote: payload.adminNote }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the application.";
    return responseError(message, message === "APPLICATION_NOT_FOUND" ? 404 : 400, message);
  }
}
