import { getChatGPTUser } from "../../chatgpt-auth";
import { cookies } from "next/headers";
import { getPlatformApplication, getPlatformApplicationForAccess, type PlatformApplication, type PlatformApplicationActorRole } from "../../../db/v32";
import { getPlatformStaffAccess } from "./staff-access";

export type PlatformApplicationAccess = {
  application: PlatformApplication;
  actor: { userId: string; email: string; role: PlatformApplicationActorRole };
  canReview: boolean;
  canSupport: boolean;
  platformRole?: "platform_owner" | "platform_operator" | "platform_support";
};

export function applicationAccessCookieName(applicationId: string) {
  return `northline_platform_access_${applicationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96)}`;
}

export async function resolvePlatformApplicationAccess(applicationId: string, token?: string | null): Promise<PlatformApplicationAccess | null> {
  const user = await getChatGPTUser();
  const staff = await getPlatformStaffAccess();
  const cookieToken = (await cookies()).get(applicationAccessCookieName(applicationId))?.value || null;
  const accessToken = token || cookieToken;
  const application = staff ? await getPlatformApplication(applicationId) : accessToken ? await getPlatformApplicationForAccess(applicationId, accessToken) : await getPlatformApplication(applicationId);
  if (!application) return null;
  if (staff) return { application, actor: { userId: staff.user.userId, email: staff.user.email, role: "platform" }, canReview: staff.canReview, canSupport: staff.canSupport, platformRole: staff.role };
  if (!user && !accessToken) return null;
  if (accessToken || (user && (application.userId === user.userId || application.email.toLowerCase() === user.email.toLowerCase()))) {
    return { application, actor: { userId: user?.userId || `application:${application.id}`, email: user?.email || application.email, role: "applicant" }, canReview: false, canSupport: false };
  }
  return null;
}
