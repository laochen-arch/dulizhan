import { getChatGPTUser } from "../../chatgpt-auth";
import { findMember } from "../../../db/cms";
import { getPlatformApplication, getPlatformApplicationForAccess, type PlatformApplication, type PlatformApplicationActorRole } from "../../../db/v32";

export type PlatformApplicationAccess = {
  application: PlatformApplication;
  actor: { userId: string; email: string; role: PlatformApplicationActorRole };
  canReview: boolean;
};

export async function resolvePlatformApplicationAccess(applicationId: string, token?: string | null): Promise<PlatformApplicationAccess | null> {
  const user = await getChatGPTUser();
  const owner = user ? (await findMember("default", user.userId, user.email))?.role === "owner" : false;
  const application = owner ? await getPlatformApplication(applicationId) : token ? await getPlatformApplicationForAccess(applicationId, token) : await getPlatformApplication(applicationId);
  if (!application) return null;
  if (owner && user) return { application, actor: { userId: user.userId, email: user.email, role: "platform" }, canReview: true };
  if (!user && !token) return null;
  if (token || (user && (application.userId === user.userId || application.email.toLowerCase() === user.email.toLowerCase()))) {
    return { application, actor: { userId: user?.userId || `application:${application.id}`, email: user?.email || application.email, role: "applicant" }, canReview: false };
  }
  return null;
}
