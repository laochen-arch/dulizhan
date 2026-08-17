import { getChatGPTUser } from "../../../chatgpt-auth";
import { findMember } from "../../../../db/cms";
import { resolvePlatformApplicationAccess } from "../application-access";
import { attachPlatformReferral, createPlatformReferralCode, getReferralCodeSummary, listPlatformReferralCenter, markPlatformReferralRewardPaid, type PlatformActor } from "../../../../db/v34";

export const dynamic = "force-dynamic";

async function actor(): Promise<{ user: Awaited<ReturnType<typeof getChatGPTUser>>; value: PlatformActor | null; owner: boolean }> {
  const user = await getChatGPTUser();
  if (!user) return { user, value: null, owner: false };
  const owner = (await findMember("default", user.userId, user.email))?.role === "owner";
  return { user, owner, value: { userId: user.userId, email: user.email, role: owner ? "platform" : "applicant" } };
}

function fail(message: string, status = 400) { return Response.json({ error: message, code: message }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (code) return Response.json({ referral: await getReferralCodeSummary(code) }, { headers: { "Cache-Control": "no-store" } });
    const current = await actor();
    if (!current.value) return fail("Sign in with email or ChatGPT to view referral rewards.", 401);
    return Response.json(await listPlatformReferralCenter(current.value), { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Unable to load referral rewards.", 503); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { action?: string; applicationId?: string; token?: string; code?: string };
    if (payload.action === "apply") {
      if (!payload.applicationId || !payload.code) return fail("Application and referral code are required.");
      const access = await resolvePlatformApplicationAccess(payload.applicationId, payload.token || null);
      if (!access) return fail("This application is not accessible.", 403);
      return Response.json({ commercial: await attachPlatformReferral(payload.applicationId, payload.code, access.actor) }, { headers: { "Cache-Control": "no-store" } });
    }
    const current = await actor();
    if (!current.value) return fail("Sign in with email or ChatGPT to create a referral link.", 401);
    if (payload.action !== "create_code") return fail("Unknown referral action.");
    return Response.json({ code: await createPlatformReferralCode(current.value) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update referral rewards.";
    const labels: Record<string, string> = { REFERRAL_CODE_INVALID: "This referral code is invalid or inactive.", REFERRAL_SELF_NOT_ALLOWED: "You cannot refer your own application." };
    return fail(labels[message] || message, message === "FORBIDDEN" ? 403 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { rewardId?: string };
    if (!payload.rewardId) return fail("Reward id is required.");
    const current = await actor();
    if (!current.value || !current.owner) return fail("Only platform owners can mark rewards as paid.", 403);
    await markPlatformReferralRewardPaid(payload.rewardId, current.value);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error instanceof Error ? error.message : "Unable to mark reward as paid."); }
}
