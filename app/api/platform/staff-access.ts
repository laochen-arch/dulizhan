import { getChatGPTUser } from "../../chatgpt-auth";
import { findMember } from "../../../db/cms";
import { findPlatformMember, platformRoleCapabilities, type PlatformRole } from "../../../db/platform-access";

export type PlatformStaffAccess = { user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>; role: PlatformRole; capabilities: string[]; canReview: boolean; canSupport: boolean };

export async function getPlatformStaffAccess(): Promise<PlatformStaffAccess | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  const defaultMembership = await findMember("default", user.userId, user.email);
  const stored = await findPlatformMember(user.userId, user.email);
  const role: PlatformRole | null = defaultMembership?.role === "owner" ? "platform_owner" : stored?.role || null;
  if (!role) return null;
  const capabilities = platformRoleCapabilities[role];
  return { user, role, capabilities, canReview: capabilities.includes("applications.review"), canSupport: capabilities.includes("support.manage") };
}
