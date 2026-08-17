import { resolvePlatformApplicationAccess } from "../application-access";
import {
  createPlatformRenewalInvoice,
  getPlatformCommercialSnapshot,
  recordPlatformPayment,
  selectPlatformPlan,
  signPlatformAgreement,
  type BillingInterval,
} from "../../../../db/v34";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to update commercial onboarding.";
  const status = ["FORBIDDEN", "AUTH_REQUIRED"].includes(message) ? 403 : ["APPLICATION_NOT_FOUND", "INVOICE_NOT_FOUND"].includes(message) ? 404 : 400;
  const labels: Record<string, string> = {
    PLAN_REQUIRED: "Choose a platform plan before signing the agreement.",
    PLAN_NOT_FOUND: "That platform plan is no longer available.",
    ACTIVE_PLAN_CHANGE_REQUIRES_REVIEW: "An active plan change needs platform review.",
    SUBSCRIPTION_NOT_ACTIVE: "Sign the platform agreement before creating a renewal invoice.",
    INVOICE_NOT_FOUND: "The invoice could not be found.",
  };
  return Response.json({ error: labels[message] || message, code: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const applicationId = url.searchParams.get("applicationId") || url.searchParams.get("id");
    if (!applicationId) return Response.json({ error: "Application id is required.", code: "APPLICATION_REQUIRED" }, { status: 400 });
    const access = await resolvePlatformApplicationAccess(applicationId, url.searchParams.get("token"));
    if (!access) return Response.json({ error: "This application is not accessible.", code: "FORBIDDEN" }, { status: 403 });
    return Response.json({ commercial: await getPlatformCommercialSnapshot(applicationId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      action?: string;
      applicationId?: string;
      token?: string;
      planId?: string;
      billingInterval?: BillingInterval;
      invoiceId?: string;
      status?: "paid" | "failed";
      provider?: string;
      providerReference?: string;
      failureReason?: string;
    };
    if (!payload.applicationId) return Response.json({ error: "Application id is required.", code: "APPLICATION_REQUIRED" }, { status: 400 });
    const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token || null);
    if (!access) return Response.json({ error: "This application is not accessible.", code: "FORBIDDEN" }, { status: 403 });
    let commercial;
    if (payload.action === "select_plan") {
      if (!payload.planId) throw new Error("PLAN_NOT_FOUND");
      commercial = await selectPlatformPlan(payload.applicationId, payload.planId, payload.billingInterval === "annual" ? "annual" : "monthly", access.actor);
    } else if (payload.action === "sign_agreement") {
      commercial = await signPlatformAgreement(payload.applicationId, access.actor);
    } else if (payload.action === "renew") {
      commercial = await createPlatformRenewalInvoice(payload.applicationId, access.actor);
    } else if (payload.action === "record_payment") {
      if (!access.canReview || !payload.invoiceId || !payload.status) throw new Error("FORBIDDEN");
      commercial = await recordPlatformPayment({ invoiceId: payload.invoiceId, status: payload.status, provider: payload.provider, providerReference: payload.providerReference, failureReason: payload.failureReason }, access.actor);
    } else {
      throw new Error("UNKNOWN_ACTION");
    }
    return Response.json({ commercial }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
