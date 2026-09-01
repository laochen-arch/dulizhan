import { ensureCmsSchema, getCmsDatabase } from "./cms";

export type PlatformRole = "platform_owner" | "platform_operator" | "platform_support";

export type PlatformMember = { userId: string; email: string; role: PlatformRole; createdAt: string; updatedAt: string };

function platformRole(value: string): PlatformRole | null {
  return value === "platform_owner" || value === "platform_operator" || value === "platform_support" ? value : null;
}

export async function findPlatformMember(userId: string, email: string): Promise<PlatformMember | null> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT user_id AS userId, email, role, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_members WHERE user_id = ?1 OR lower(email) = lower(?2) LIMIT 1`).bind(userId, email).first<{ userId: string; email: string; role: string; createdAt: string; updatedAt: string }>();
  const role = row ? platformRole(row.role) : null;
  return row && role ? { ...row, role } : null;
}

export const platformRoleCapabilities: Record<PlatformRole, string[]> = {
  platform_owner: ["applications.read", "applications.review", "sites.create", "domains.manage", "billing.manage", "support.manage", "platform.team.manage"],
  platform_operator: ["applications.read", "applications.review", "sites.create", "domains.manage", "billing.manage", "support.manage"],
  platform_support: ["applications.read", "support.manage"],
};
