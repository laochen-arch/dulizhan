import { createTenantBackup, downloadTenantBackup, listTenantBackups, verifyTenantBackup } from "../../../../db/production";
import { merchantErrorResponse, requireMerchantCapability } from "../helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireMerchantCapability(request, "merchant.data.export");
    const backupId = new URL(request.url).searchParams.get("download");
    if (backupId) {
      const text = await downloadTenantBackup(access.site.id, backupId);
      return new Response(text, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${access.site.slug}-${backupId}.json"`, "Cache-Control": "private, no-store" } });
    }
    return Response.json({ backups: await listTenantBackups(access.site.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { siteId?: string; action?: string; backupId?: string };
    const access = await requireMerchantCapability(request, "merchant.data.export", payload.siteId);
    const actor = { userId: access.user!.userId, email: access.user!.email };
    if (payload.action === "verify") {
      if (!payload.backupId) return Response.json({ error: "Choose a backup for the restore drill.", code: "BACKUP_REQUIRED" }, { status: 400 });
      return Response.json({ backup: await verifyTenantBackup(access.site.id, payload.backupId, actor) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ backup: await createTenantBackup(access.site.id, "manual", actor) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return merchantErrorResponse(error);
  }
}
