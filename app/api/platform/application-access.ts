import { getChatGPTUser } from "../../chatgpt-auth";
import { cookies } from "next/headers";
import { findMember } from "../../../db/cms";
import { getPlatformApplication, getPlatformApplicationForAccess, type PlatformApplication, type PlatformApplicationActorRole } from "../../../db/v32";

export type PlatformApplicationAccess = {
  application: PlatformApplication;
  actor: { userId: string; email: string; role: PlatformApplicationActorRole };
  canReview: boolean;
};

export function applicationAccessCookieName(applicationId: string) {
  return `northline_platform_access_${applicationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96)}`;
}

export async function resolvePlatformApplicationAccess(applicationId: string, token?: string | null): Promise<PlatformApplicationAccess | null> {
  const user = await getChatGPTUser();
  const owner = user ? (await findMember("default", user.userId, user.email))?.role === "owner" : false;
  const cookieToken = (await cookies()).get(applicationAccessCookieName(applicationId))?.value || null;
  const accessToken = token || cookieToken;
  const application = owner ? await getPlatformApplication(applicationId) : accessToken ? await getPlatformApplicationForAccess(applicationId, accessToken) : await getPlatformApplication(applicationId);
  if (!application) return null;
  if (owner && user) return { application, actor: { userId: user.userId, email: user.email, role: "platform" }, canReview: true };
  if (!user && !accessToken) return null;
  if (accessToken || (user && (application.userId === user.userId || application.email.toLowerCase() === user.email.toLowerCase()))) {
    return { application, actor: { userId: user?.userId || `application:${application.id}`, email: user?.email || application.email, role: "applicant" }, canReview: false };
  }
  return null;
}
