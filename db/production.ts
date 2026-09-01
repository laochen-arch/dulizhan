import { ensureCmsSchema, getCmsDatabase, getMediaBucket, recordAudit, type D1DatabaseLike } from "./cms";

export type TenantBackup = {
  id: string;
  siteId: string;
  objectKey: string;
  status: "stored" | "verified" | "failed";
  reason: "manual" | "daily";
  checksum: string;
  rowCounts: Record<string, number>;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
  verifiedAt: string | null;
  lastError: string | null;
};

type BackupEnvelope = {
  version: 1;
  siteId: string;
  createdAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
};

type R2Body = { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };

const RETAIN_BACKUPS = 14;
const TENANT_TABLES = [
  "cms_site_settings",
  "cms_site_products",
  "cms_members",
  "cms_revisions",
  "cms_assets",
  "cms_invitations",
  "cms_audit_logs",
  "cms_operation_events",
  "cms_delivery_runs",
  "cms_scheduled_publishes",
  "cms_site_domains",
  "cms_launch_checks",
  "cms_inventory",
  "cms_inventory_transactions",
  "cms_orders",
  "cms_order_items",
  "cms_payment_events",
  "cms_order_notifications",
  "cms_refunds",
  "cms_order_state_events",
  "cms_order_access_tokens",
  "cms_after_sales_requests",
  "cms_client_intake",
  "cms_coupons",
  "cms_bundles",
  "cms_collections",
  "cms_recommendation_rules",
  "cms_campaign_schedules",
  "cms_reviews",
  "cms_abandoned_checkouts",
  "cms_health_checks",
  "cms_release_requests",
  "merchant_members",
  "store_customers",
  "customer_addresses",
  "store_wishlists",
  "store_carts",
  "store_newsletter_subscribers",
  "store_stock_alerts",
] as const;

function now() {
  return new Date().toISOString();
}

function safeSiteKey(siteId: string) {
  return siteId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function ensureProductionSchema(database: D1DatabaseLike) {
  await ensureCmsSchema(database);
  await database.prepare(`CREATE TABLE IF NOT EXISTS cms_tenant_backups (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    checksum TEXT NOT NULL,
    row_counts TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    verified_at TEXT,
    last_error TEXT
  )`).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS cms_tenant_backups_site_idx ON cms_tenant_backups(site_id, created_at)").run();
}

function backupFromRow(row: Record<string, unknown>): TenantBackup {
  return {
    id: String(row.id),
    siteId: String(row.siteId),
    objectKey: String(row.objectKey),
    status: String(row.status) as TenantBackup["status"],
    reason: String(row.reason) as TenantBackup["reason"],
    checksum: String(row.checksum),
    rowCounts: JSON.parse(String(row.rowCounts || "{}")) as Record<string, number>,
    sizeBytes: Number(row.sizeBytes || 0),
    createdBy: String(row.createdBy),
    createdAt: String(row.createdAt),
    verifiedAt: row.verifiedAt ? String(row.verifiedAt) : null,
    lastError: row.lastError ? String(row.lastError) : null,
  };
}

export async function listTenantBackups(siteId: string, database = getCmsDatabase()) {
  await ensureProductionSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, object_key AS objectKey, status, reason, checksum,
    row_counts AS rowCounts, size_bytes AS sizeBytes, created_by AS createdBy, created_at AS createdAt,
    verified_at AS verifiedAt, last_error AS lastError
    FROM cms_tenant_backups WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(siteId).all<Record<string, unknown>>();
  return rows.results.map(backupFromRow);
}

async function collectTenantData(database: D1DatabaseLike, siteId: string): Promise<BackupEnvelope> {
  const tables: BackupEnvelope["tables"] = {};
  const site = await database.prepare("SELECT * FROM cms_sites WHERE id = ?1").bind(siteId).all<Record<string, unknown>>();
  tables.cms_sites = site.results;
  for (const table of TENANT_TABLES) {
    try {
      const rows = await database.prepare(`SELECT * FROM ${table} WHERE site_id = ?1`).bind(siteId).all<Record<string, unknown>>();
      tables[table] = rows.results;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("no such table")) throw error;
      tables[table] = [];
    }
  }
  return { version: 1, siteId, createdAt: now(), tables };
}

async function readR2Text(object: unknown) {
  const body = object as R2Body | null;
  if (!body) throw new Error("BACKUP_OBJECT_NOT_FOUND");
  if (body.text) return body.text();
  if (body.arrayBuffer) return new TextDecoder().decode(await body.arrayBuffer());
  throw new Error("BACKUP_OBJECT_UNREADABLE");
}

async function purgeOldBackups(siteId: string, database: D1DatabaseLike) {
  const rows = await database.prepare("SELECT id, object_key AS objectKey FROM cms_tenant_backups WHERE site_id = ?1 ORDER BY created_at DESC LIMIT -1 OFFSET ?2").bind(siteId, RETAIN_BACKUPS).all<{ id: string; objectKey: string }>();
  const bucket = getMediaBucket();
  for (const row of rows.results) {
    await bucket.delete(row.objectKey).catch(() => undefined);
    await database.prepare("DELETE FROM cms_tenant_backups WHERE id = ?1 AND site_id = ?2").bind(row.id, siteId).run();
  }
}

export async function verifyTenantBackup(siteId: string, backupId: string, actor: { userId: string; email: string }, database = getCmsDatabase()) {
  await ensureProductionSchema(database);
  const backup = await database.prepare(`SELECT id, site_id AS siteId, object_key AS objectKey, status, reason, checksum,
    row_counts AS rowCounts, size_bytes AS sizeBytes, created_by AS createdBy, created_at AS createdAt,
    verified_at AS verifiedAt, last_error AS lastError FROM cms_tenant_backups WHERE id = ?1 AND site_id = ?2`).bind(backupId, siteId).first<Record<string, unknown>>();
  if (!backup) throw new Error("BACKUP_NOT_FOUND");
  const row = backupFromRow(backup);
  try {
    const text = await readR2Text(await getMediaBucket().get(row.objectKey));
    const envelope = JSON.parse(text) as BackupEnvelope;
    const checksum = await sha256(text);
    if (checksum !== row.checksum || envelope.version !== 1 || envelope.siteId !== siteId || !envelope.tables.cms_sites?.length) throw new Error("BACKUP_VALIDATION_FAILED");
    const verifiedAt = now();
    await database.prepare("UPDATE cms_tenant_backups SET status = 'verified', verified_at = ?1, last_error = NULL WHERE id = ?2 AND site_id = ?3").bind(verifiedAt, backupId, siteId).run();
    await recordAudit(database, siteId, actor, "backup.restore_drill_completed", "tenant_backup", backupId, { checksum, rowCounts: row.rowCounts, dryRun: true });
    return { ...row, status: "verified" as const, verifiedAt, lastError: null, restoreDrill: { dryRun: true, recoverable: true, rowCounts: row.rowCounts } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BACKUP_VALIDATION_FAILED";
    await database.prepare("UPDATE cms_tenant_backups SET status = 'failed', last_error = ?1 WHERE id = ?2 AND site_id = ?3").bind(message, backupId, siteId).run();
    await recordAudit(database, siteId, actor, "backup.restore_drill_failed", "tenant_backup", backupId, { error: message });
    throw error;
  }
}

export async function createTenantBackup(siteId: string, reason: TenantBackup["reason"], actor: { userId: string; email: string }, database = getCmsDatabase()) {
  await ensureProductionSchema(database);
  if (reason === "daily") {
    const day = now().slice(0, 10);
    const existing = await database.prepare("SELECT id FROM cms_tenant_backups WHERE site_id = ?1 AND reason = 'daily' AND substr(created_at, 1, 10) = ?2 AND status IN ('stored', 'verified') LIMIT 1").bind(siteId, day).first<{ id: string }>();
    if (existing) return (await listTenantBackups(siteId, database)).find((item) => item.id === existing.id) || null;
  }
  const envelope = await collectTenantData(database, siteId);
  const text = JSON.stringify(envelope);
  const checksum = await sha256(text);
  const id = `backup_${crypto.randomUUID()}`;
  const createdAt = envelope.createdAt;
  const objectKey = `backups/${safeSiteKey(siteId)}/${createdAt.replace(/[:.]/g, "-")}-${id}.json`;
  const rowCounts = Object.fromEntries(Object.entries(envelope.tables).map(([table, rows]) => [table, rows.length]));
  await getMediaBucket().put(objectKey, text, { httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" } });
  await database.prepare(`INSERT INTO cms_tenant_backups (id, site_id, object_key, status, reason, checksum, row_counts, size_bytes, created_by, created_at)
    VALUES (?1, ?2, ?3, 'stored', ?4, ?5, ?6, ?7, ?8, ?9)`).bind(id, siteId, objectKey, reason, checksum, JSON.stringify(rowCounts), new TextEncoder().encode(text).byteLength, actor.userId, createdAt).run();
  await recordAudit(database, siteId, actor, "backup.created", "tenant_backup", id, { reason, rowCounts });
  const verified = await verifyTenantBackup(siteId, id, actor, database);
  await purgeOldBackups(siteId, database);
  return verified;
}

export async function downloadTenantBackup(siteId: string, backupId: string, database = getCmsDatabase()) {
  await ensureProductionSchema(database);
  const backup = await database.prepare("SELECT object_key AS objectKey, checksum FROM cms_tenant_backups WHERE id = ?1 AND site_id = ?2 AND status = 'verified'").bind(backupId, siteId).first<{ objectKey: string; checksum: string }>();
  if (!backup) throw new Error("BACKUP_NOT_FOUND");
  const text = await readR2Text(await getMediaBucket().get(backup.objectKey));
  if (await sha256(text) !== backup.checksum) throw new Error("BACKUP_VALIDATION_FAILED");
  return text;
}

export async function ensureDailyTenantBackup(siteId: string, database = getCmsDatabase()) {
  return createTenantBackup(siteId, "daily", { userId: "system", email: "system@northlinesupply.com" }, database);
}
