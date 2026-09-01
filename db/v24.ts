import { getProductionReadiness } from "./v22";
import { createAfterSalesRequest, listAfterSalesRequests, type AfterSalesRequest } from "./v21";
import { getCmsDatabase, ensureCmsSchema, getMember, getOperationalMember, getSnapshotDiff, listRevisions, publishDraft, recordAudit, rollbackRevision } from "./cms";
import { readOrder, listInventory, listOrders, listPaymentEvents } from "./commerce";
import { getSiteIntegrationStatuses } from "./site-integrations";
import { listTenantBackups } from "./production";
import type { CmsOrderDetail } from "./commerce";

function now() {
  return new Date().toISOString();
}

async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type V24ReleaseRequestStatus = "pending" | "approved" | "rejected" | "published" | "cancelled";

export type V24ReleaseRequest = {
  id: string;
  siteId: string;
  status: V24ReleaseRequestStatus;
  label: string;
  note: string | null;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  revisionId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReleaseRow = Omit<V24ReleaseRequest, "status"> & { status: string };

const releaseSelect = `id, site_id AS siteId, status, label, note, requested_by AS requestedBy,
  requested_by_email AS requestedByEmail, requested_at AS requestedAt, reviewed_by AS reviewedBy,
  reviewed_by_email AS reviewedByEmail, reviewed_at AS reviewedAt, revision_id AS revisionId,
  published_at AS publishedAt, created_at AS createdAt, updated_at AS updatedAt`;

function releaseFromRow(row: ReleaseRow): V24ReleaseRequest {
  const statuses: V24ReleaseRequestStatus[] = ["pending", "approved", "rejected", "published", "cancelled"];
  return { ...row, status: statuses.includes(row.status as V24ReleaseRequestStatus) ? row.status as V24ReleaseRequestStatus : "pending" };
}

async function releaseById(siteId: string, requestId: string) {
  const database = getCmsDatabase();
  const row = await database.prepare(`SELECT ${releaseSelect} FROM cms_release_requests WHERE site_id = ?1 AND id = ?2`).bind(siteId, requestId).first<ReleaseRow>();
  if (!row) throw new Error("RELEASE_REQUEST_NOT_FOUND");
  return releaseFromRow(row);
}

export async function listReleaseRequests(siteId: string, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, email, true);
  else await getMember(siteId, userId, email);
  const rows = await database.prepare(`SELECT ${releaseSelect} FROM cms_release_requests WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(siteId).all<ReleaseRow>();
  return rows.results.map(releaseFromRow);
}

export async function createReleaseRequest(siteId: string, input: { label?: string; note?: string }, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const timestamp = now();
  const id = `release_${crypto.randomUUID()}`;
  const label = String(input.label || "Client storefront release").trim().slice(0, 160) || "Client storefront release";
  const note = String(input.note || "").trim().slice(0, 2000) || null;
  await database.prepare(`INSERT INTO cms_release_requests (id, site_id, status, label, note, requested_by, requested_by_email, requested_at, created_at, updated_at)
    VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7, ?7, ?7)`).bind(id, siteId, label, note, userId, email, timestamp).run();
  await recordAudit(database, siteId, { userId, email }, "release.requested", "release_request", id, { label, note });
  return releaseById(siteId, id);
}

export async function reviewReleaseRequest(siteId: string, requestId: string, action: "approve" | "reject" | "publish" | "cancel", userId: string, email: string, note?: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = await getMember(siteId, userId, email);
  const current = await releaseById(siteId, requestId);
  const timestamp = now();
  if (action === "cancel") {
    if (member.role !== "owner" && current.requestedBy !== userId) throw new Error("FORBIDDEN");
    if (["published", "cancelled"].includes(current.status)) throw new Error("INVALID_RELEASE_ACTION");
    await database.prepare("UPDATE cms_release_requests SET status = 'cancelled', updated_at = ?1 WHERE site_id = ?2 AND id = ?3").bind(timestamp, siteId, requestId).run();
    await recordAudit(database, siteId, { userId, email }, "release.cancelled", "release_request", requestId);
    return releaseById(siteId, requestId);
  }
  if (member.role !== "owner") throw new Error("OWNER_APPROVAL_REQUIRED");
  if (action === "approve" || action === "reject") {
    if (current.status !== "pending") throw new Error("INVALID_RELEASE_ACTION");
    const nextStatus = action === "approve" ? "approved" : "rejected";
    await database.prepare(`UPDATE cms_release_requests SET status = ?1, note = COALESCE(?2, note), reviewed_by = ?3, reviewed_by_email = ?4, reviewed_at = ?5, updated_at = ?5 WHERE site_id = ?6 AND id = ?7`)
      .bind(nextStatus, String(note || "").trim().slice(0, 2000) || null, userId, email, timestamp, siteId, requestId).run();
    await recordAudit(database, siteId, { userId, email }, `release.${nextStatus}`, "release_request", requestId, { note: note || null });
    return releaseById(siteId, requestId);
  }
  if (current.status !== "approved") throw new Error("RELEASE_NOT_APPROVED");
  const published = await publishDraft(siteId, current.label, userId, email);
  await database.prepare(`UPDATE cms_release_requests SET status = 'published', revision_id = ?1, published_at = ?2, reviewed_by = ?3, reviewed_by_email = ?4, reviewed_at = ?2, updated_at = ?2 WHERE site_id = ?5 AND id = ?6`)
    .bind(published.revisionId, published.publishedAt, userId, email, siteId, requestId).run();
  await recordAudit(database, siteId, { userId, email }, "release.published", "release_request", requestId, { revisionId: published.revisionId });
  return releaseById(siteId, requestId);
}

export async function rollbackPublishedRevision(siteId: string, revisionId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = await getMember(siteId, userId, email);
  if (member.role !== "owner") throw new Error("OWNER_APPROVAL_REQUIRED");
  await rollbackRevision(siteId, revisionId, userId, email);
  const published = await publishDraft(siteId, `Rollback to ${revisionId}`, userId, email);
  await recordAudit(database, siteId, { userId, email }, "release.rollback_published", "revision", revisionId, { newRevisionId: published.revisionId });
  return published;
}

export async function createPreviewShare(siteId: string, hoursInput: number | undefined, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const hours = Math.max(1, Math.min(168, Number(hoursInput || 24)));
  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const timestamp = now();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await database.prepare(`INSERT INTO cms_preview_tokens (id, site_id, token_hash, mode, expires_at, created_by, created_at)
    VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6)`).bind(`preview_${crypto.randomUUID()}`, siteId, await hashToken(token), expiresAt, userId, timestamp).run();
  await recordAudit(database, siteId, { userId, email }, "preview.share_created", "preview_token", siteId, { expiresAt });
  return { token, expiresAt };
}

export async function validatePreviewShare(siteId: string, token: string) {
  if (!token || token.length < 24) return false;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const timestamp = now();
  const hash = await hashToken(token);
  const row = await database.prepare("SELECT id FROM cms_preview_tokens WHERE site_id = ?1 AND token_hash = ?2 AND mode = 'draft' AND expires_at > ?3").bind(siteId, hash, timestamp).first<{ id: string }>();
  if (!row) return false;
  await database.prepare("UPDATE cms_preview_tokens SET last_used_at = ?1 WHERE id = ?2").bind(timestamp, row.id).run();
  return true;
}

export async function getV24LaunchCenter(siteId: string, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, email, true);
  else await getMember(siteId, userId, email);
  const [readiness, releases, revisions, diff, integrations, orders, inventory, afterSales, backups] = await Promise.all([
    getProductionReadiness(siteId, userId, email, allowMerchant),
    listReleaseRequests(siteId, userId, email, allowMerchant),
    listRevisions(siteId, userId, email, allowMerchant),
    getSnapshotDiff(siteId, userId, email, allowMerchant),
    getSiteIntegrationStatuses(siteId, database),
    listOrders(siteId, userId, email),
    listInventory(siteId, userId, email, allowMerchant),
    listAfterSalesRequests(siteId),
    listTenantBackups(siteId, database),
  ]);
  return {
    siteId,
    readiness,
    releases,
    revisions,
    diff,
    integrations,
    backups,
    operations: {
      orders: orders.length,
      paidOrders: orders.filter((order) => ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)).length,
      openAfterSales: afterSales.filter((request) => !["rejected", "completed"].includes(request.status)).length,
      lowStock: inventory.filter((row) => row.quantity - row.reservedQuantity <= 5).length,
      availableUnits: inventory.reduce((sum, row) => sum + Math.max(0, row.quantity - row.reservedQuantity), 0),
      failedEvents: readiness.recentOperations.filter((event) => event.status === "failed").length,
    },
  };
}

export type ClientOrderDetail = {
  order: Omit<CmsOrderDetail["order"], "paypalOrderId" | "paypalApprovalUrl" | "paypalCaptureId" | "adminNote"> & { paypalOrderId: null; paypalApprovalUrl: null; paypalCaptureId: null; adminNote: null };
  items: CmsOrderDetail["items"];
  refunds: CmsOrderDetail["refunds"];
  stateEvents: CmsOrderDetail["stateEvents"];
  afterSales: AfterSalesRequest[];
};

export async function getClientOrderDetail(siteId: string, orderId: string, userId: string, email: string, allowMerchant = false): Promise<ClientOrderDetail> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, email, true);
  else await getMember(siteId, userId, email);
  const detail = await readOrder(database, orderId, siteId);
  const afterSales = (await listAfterSalesRequests(siteId)).filter((request) => request.orderId === orderId);
  return {
    order: { ...detail.order, paypalOrderId: null, paypalApprovalUrl: null, paypalCaptureId: null, adminNote: null },
    items: detail.items,
    refunds: detail.refunds,
    stateEvents: detail.stateEvents,
    afterSales,
  };
}

export async function submitClientAfterSales(siteId: string, input: { orderNumber: string; email: string; requestType: string; reason: string; customerNote?: string; requestedAmount?: number; items?: Array<{ productId: string; variantId: string; quantity: number }> }, userId: string, actorEmail: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, actorEmail, true);
  else await getMember(siteId, userId, actorEmail);
  const request = await createAfterSalesRequest(siteId, input);
  await recordAudit(database, siteId, { userId, email: actorEmail }, "client.after_sales_submitted", "after_sales", request.id, { orderId: request.orderId, requestType: request.requestType });
  return request;
}

export async function getClientOperations(siteId: string, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, email, true);
  else await getMember(siteId, userId, email);
  const [orders, inventory, afterSales, paymentEvents] = await Promise.all([
    listOrders(siteId, userId, email),
    listInventory(siteId, userId, email),
    listAfterSalesRequests(siteId),
    listPaymentEvents(siteId, userId, email),
  ]);
  return { orders, inventory, afterSales, paymentEvents };
}
