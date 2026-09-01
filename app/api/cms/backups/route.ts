import { createTenantBackup, downloadTenantBackup, listTenantBackups, verifyTenantBackup } from "../../../../db/production";
import { errorResponse, getSiteId, requireMember } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const siteId = getSiteId(request);
    await requireMember(siteId, "owner");
    const backupId = new URL(request.url).searchParams.get("download");
    if (backupId) {
      const text = await downloadTenantBackup(siteId, backupId);
      return new Response(text, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${siteId}-${backupId}.json"`, "Cache-Control": "private, no-store" } });
    }
    return Response.json({ backups: await listTenantBackups(siteId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; action?: string; backupId?: string };
    const siteId = getSiteId(request, payload.siteId);
    const access = await requireMember(siteId, "owner");
    const actor = { userId: access.user.userId, email: access.user.email };
    if (payload.action === "verify") {
      if (!payload.backupId) return Response.json({ error: "Choose a backup for the restore drill.", code: "BACKUP_REQUIRED" }, { status: 400 });
      return Response.json({ backup: await verifyTenantBackup(siteId, payload.backupId, actor) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ backup: await createTenantBackup(siteId, "manual", actor) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
