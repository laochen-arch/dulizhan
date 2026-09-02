import { getCmsDatabase } from "./cms";
import { listPlatformMembers, type PlatformMember } from "./platform-access";
import { ensureV61Schema } from "./v61";

export type PlatformWorkCategory = "application_review" | "support" | "billing" | "delivery" | "webhook" | "email" | "domain";
export type PlatformWorkStatus = "open" | "in_progress" | "waiting" | "resolved";
export type PlatformWorkPriority = "urgent" | "high" | "normal" | "low";
export type PlatformWorkActor = { userId: string; email: string; capabilities: string[] };

export type PlatformWorkItem = {
  id: string; sourceType: string; sourceId: string; applicationId: string | null; category: PlatformWorkCategory;
  title: string; description: string | null; sourceStatus: string; status: PlatformWorkStatus; priority: PlatformWorkPriority;
  assignedToUserId: string | null; assignedToEmail: string | null; dueAt: string; snoozedUntil: string | null;
  resolvedAt: string | null; sourceUpdatedAt: string | null; createdAt: string; updatedAt: string;
  brandName: string | null; companyName: string | null; applicantEmail: string | null; canonicalUrl: string;
  slaState: "overdue" | "due_soon" | "on_track" | "snoozed" | "resolved";
};

type Row = Record<string, unknown>;
type SourceItem = { sourceType: string; sourceId: string; applicationId: string | null; category: PlatformWorkCategory; title: string; description: string; sourceStatus: string; sourceUpdatedAt: string; priority: PlatformWorkPriority; dueAt: string };

const now = () => new Date().toISOString();
const hoursAfter = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
const text = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validCategory = (value: unknown): value is PlatformWorkCategory => ["application_review", "support", "billing", "delivery", "webhook", "email", "domain"].includes(String(value));
const validPriority = (value: unknown): value is PlatformWorkPriority => ["urgent", "high", "normal", "low"].includes(String(value));
const validStatus = (value: unknown): value is Exclude<PlatformWorkStatus, "resolved"> => ["open", "in_progress", "waiting"].includes(String(value));

function changed(result: unknown) { return Number((result as { meta?: { changes?: number } })?.meta?.changes || 0); }

export async function ensurePlatformOperationsSchema() {
  await ensureV61Schema();
  const database = getCmsDatabase();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_work_items (id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL, application_id TEXT, category TEXT NOT NULL, title TEXT NOT NULL, description TEXT, source_status TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal', assigned_to_user_id TEXT, assigned_to_email TEXT, due_at TEXT NOT NULL, snoozed_until TEXT, resolved_at TEXT, source_updated_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source_type, source_id))`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_work_items_queue_idx ON platform_work_items(status, priority, due_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_work_items_assignee_idx ON platform_work_items(assigned_to_user_id, status, due_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_work_items_application_idx ON platform_work_items(application_id, category, updated_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_work_item_events (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_work_item_events_idx ON platform_work_item_events(work_item_id, created_at DESC)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_saved_work_views (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, filters_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, name))`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_saved_work_views_user_idx ON platform_saved_work_views(user_id, updated_at DESC)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_work_reminders (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL UNIQUE, reminder_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', generated_at TEXT NOT NULL, dismissed_by TEXT, dismissed_at TEXT, updated_at TEXT NOT NULL)`),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_work_reminders_status_idx ON platform_work_reminders(status, reminder_type, updated_at DESC)"),
  ]);
}

function sourceItem(row: Row): SourceItem | null {
  const category = String(row.category);
  const priority = String(row.priority);
  if (!validCategory(category) || !validPriority(priority)) return null;
  return { sourceType: String(row.sourceType), sourceId: String(row.sourceId), applicationId: row.applicationId ? String(row.applicationId) : null, category, title: text(row.title, 240), description: text(row.description, 1000), sourceStatus: text(row.sourceStatus, 80), sourceUpdatedAt: String(row.sourceUpdatedAt || now()), priority, dueAt: String(row.dueAt) };
}

async function collectSourceItems(): Promise<SourceItem[]> {
  const database = getCmsDatabase();
  const timestamp = now();
  const rows = await database.prepare(`
    SELECT 'application' AS sourceType, a.id AS sourceId, a.id AS applicationId, 'application_review' AS category,
      '审核商户申请 · ' || a.brand_name AS title,
      CASE a.status WHEN 'needs_info' THEN '商户需要补充资料，请确认缺失项并跟进。' ELSE '新申请等待平台审核和下一步处理。' END AS description,
      a.status AS sourceStatus, a.updated_at AS sourceUpdatedAt,
      CASE a.status WHEN 'submitted' THEN 'high' ELSE 'normal' END AS priority,
      strftime('%Y-%m-%dT%H:%M:%fZ', a.updated_at, CASE a.status WHEN 'submitted' THEN '+24 hours' ELSE '+72 hours' END) AS dueAt
    FROM platform_applications a WHERE a.status IN ('submitted','reviewing','needs_info')
    UNION ALL
    SELECT 'support_ticket', t.id, t.application_id, 'support', '处理商户工单 · ' || t.subject,
      substr(t.message, 1, 500), t.status, t.updated_at, 'high', strftime('%Y-%m-%dT%H:%M:%fZ', t.updated_at, '+8 hours')
    FROM platform_support_tickets t WHERE t.status IN ('open','in_progress')
    UNION ALL
    SELECT 'billing_invoice', i.id, i.application_id, 'billing', '处理平台账单 · ' || i.invoice_number,
      COALESCE(i.failure_reason, '平台服务费账单已到期或扣款失败。'), i.status, i.updated_at, 'urgent', strftime('%Y-%m-%dT%H:%M:%fZ', i.updated_at, '+4 hours')
    FROM platform_billing_invoices i WHERE i.status = 'failed' OR (i.status = 'open' AND i.due_at <= ?1)
    UNION ALL
    SELECT 'delivery_job', d.id, d.application_id, 'delivery', '恢复站点交付 · ' || COALESCE(a.brand_name, d.application_id),
      COALESCE(d.last_error, '站点交付任务需要继续处理。'), d.status, d.updated_at, 'urgent', strftime('%Y-%m-%dT%H:%M:%fZ', d.updated_at, '+4 hours')
    FROM platform_delivery_jobs d LEFT JOIN platform_applications a ON a.id = d.application_id WHERE d.status IN ('failed','manual_review')
    UNION ALL
    SELECT 'billing_webhook', w.provider_event_id, w.application_id, 'webhook', '处理 PayPal 回调 · ' || w.event_type,
      COALESCE(w.last_error, 'PayPal 回调处理失败。'), w.status, w.received_at, 'urgent', strftime('%Y-%m-%dT%H:%M:%fZ', w.received_at, '+1 hour')
    FROM platform_billing_webhook_events w WHERE w.status IN ('failed','dead_letter')
    UNION ALL
    SELECT 'application_notification', n.id, n.application_id, 'email', '重试商户邮件 · ' || n.subject,
      COALESCE(n.last_error, '商户邮件发送失败。'), n.status, n.updated_at, 'high', strftime('%Y-%m-%dT%H:%M:%fZ', n.updated_at, '+4 hours')
    FROM platform_application_notifications n WHERE n.status = 'failed'
    UNION ALL
    SELECT 'domain_request', d.id, d.application_id, 'domain', '处理域名接入 · ' || d.hostname,
      COALESCE(d.note, '域名接入申请等待平台处理。'), d.status, d.updated_at,
      CASE d.status WHEN 'failed' THEN 'high' ELSE 'normal' END, strftime('%Y-%m-%dT%H:%M:%fZ', d.updated_at, '+48 hours')
    FROM platform_domain_requests d WHERE d.status IN ('pending','reviewing','failed')
  `).bind(timestamp).all<Row>();
  return rows.results.flatMap((row) => sourceItem(row) || []);
}

async function closeInactiveSourceItems() {
  const database = getCmsDatabase();
  const timestamp = now();
  const rules = [
    ["application", "platform_applications", "id", "status NOT IN ('submitted','reviewing','needs_info')"],
    ["support_ticket", "platform_support_tickets", "id", "status NOT IN ('open','in_progress')"],
    ["billing_invoice", "platform_billing_invoices", "id", "status <> 'failed' AND NOT (status = 'open' AND due_at <= datetime('now'))"],
    ["delivery_job", "platform_delivery_jobs", "id", "status NOT IN ('failed','manual_review')"],
    ["billing_webhook", "platform_billing_webhook_events", "provider_event_id", "status NOT IN ('failed','dead_letter')"],
    ["application_notification", "platform_application_notifications", "id", "status <> 'failed'"],
    ["domain_request", "platform_domain_requests", "id", "status NOT IN ('pending','reviewing','failed')"],
  ];
  for (const [sourceType, table, key, closed] of rules) {
    await database.prepare(`UPDATE platform_work_items SET status = 'resolved', resolved_at = ?1, snoozed_until = NULL, updated_at = ?1
      WHERE source_type = ?2 AND status <> 'resolved' AND (NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.${key} = platform_work_items.source_id) OR EXISTS (SELECT 1 FROM ${table} s WHERE s.${key} = platform_work_items.source_id AND ${closed}))`).bind(timestamp, sourceType).run();
  }
}

async function syncReminders() {
  const database = getCmsDatabase();
  const timestamp = now();
  const dueSoon = hoursAfter(4);
  const rows = await database.prepare(`SELECT id, due_at AS dueAt FROM platform_work_items
    WHERE status <> 'resolved' AND (snoozed_until IS NULL OR snoozed_until <= ?1) AND due_at <= ?2`).bind(timestamp, dueSoon).all<{ id: string; dueAt: string }>();
  for (const row of rows.results) {
    const type = row.dueAt <= timestamp ? "overdue" : "due_soon";
    await database.prepare(`INSERT INTO platform_work_reminders (id, work_item_id, reminder_type, status, generated_at, dismissed_by, dismissed_at, updated_at)
      VALUES (?1, ?2, ?3, 'active', ?4, NULL, NULL, ?4)
      ON CONFLICT(work_item_id) DO UPDATE SET reminder_type = excluded.reminder_type, status = CASE WHEN platform_work_reminders.reminder_type <> excluded.reminder_type THEN 'active' ELSE platform_work_reminders.status END, updated_at = excluded.updated_at`).bind(`work_reminder_${crypto.randomUUID()}`, row.id, type, timestamp).run();
  }
  await database.prepare(`UPDATE platform_work_reminders SET status = 'dismissed', updated_at = ?1
    WHERE status = 'active' AND work_item_id IN (SELECT id FROM platform_work_items WHERE status = 'resolved' OR snoozed_until > ?1 OR due_at > ?2)`).bind(timestamp, dueSoon).run();
}

export async function syncPlatformWorkQueue() {
  await ensurePlatformOperationsSchema();
  const database = getCmsDatabase();
  const timestamp = now();
  const sources = await collectSourceItems();
  for (const item of sources) {
    await database.prepare(`INSERT INTO platform_work_items
      (id, source_type, source_id, application_id, category, title, description, source_status, status, priority, assigned_to_user_id, assigned_to_email, due_at, snoozed_until, resolved_at, source_updated_at, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', ?9, NULL, NULL, ?10, NULL, NULL, ?11, ?12, ?12)
      ON CONFLICT(source_type, source_id) DO UPDATE SET application_id = excluded.application_id, category = excluded.category, title = excluded.title,
        description = excluded.description, source_status = excluded.source_status, source_updated_at = excluded.source_updated_at,
        status = CASE WHEN platform_work_items.status = 'resolved' THEN 'open' ELSE platform_work_items.status END,
        priority = CASE WHEN platform_work_items.status = 'resolved' THEN excluded.priority ELSE platform_work_items.priority END,
        due_at = CASE WHEN platform_work_items.status = 'resolved' THEN excluded.due_at ELSE platform_work_items.due_at END,
        resolved_at = CASE WHEN platform_work_items.status = 'resolved' THEN NULL ELSE platform_work_items.resolved_at END, updated_at = excluded.updated_at`)
      .bind(`work_${crypto.randomUUID()}`, item.sourceType, item.sourceId, item.applicationId, item.category, item.title, item.description || null, item.sourceStatus, item.priority, item.dueAt, item.sourceUpdatedAt, timestamp).run();
  }
  await closeInactiveSourceItems();
  await syncReminders();
  return { synchronized: sources.length, at: timestamp };
}

function categoryCapabilities(category: PlatformWorkCategory) {
  if (["billing", "webhook"].includes(category)) return ["billing.manage"];
  if (category === "domain") return ["domains.manage"];
  if (["support", "email"].includes(category)) return ["support.manage"];
  return ["applications.review"];
}

function canManage(category: PlatformWorkCategory, capabilities: string[]) { return categoryCapabilities(category).some((capability) => capabilities.includes(capability)); }
function visibleCategories(capabilities: string[]) { return (["application_review", "support", "billing", "delivery", "webhook", "email", "domain"] as PlatformWorkCategory[]).filter((category) => canManage(category, capabilities)); }

function canonicalUrl(row: Row) {
  const applicationId = encodeURIComponent(String(row.applicationId || ""));
  if (["billing", "delivery", "webhook"].includes(String(row.category))) return `/admin?tab=commercial&view=detail&record=${applicationId}`;
  if (row.category === "domain") return `/admin?tab=domains${applicationId ? `&record=${applicationId}` : ""}`;
  return `/admin?tab=merchants&view=detail&record=${applicationId}`;
}

function workItemFromRow(row: Row): PlatformWorkItem {
  const status = ["in_progress", "waiting", "resolved"].includes(String(row.status)) ? String(row.status) as PlatformWorkStatus : "open";
  const priority = validPriority(row.priority) ? row.priority : "normal";
  const category = validCategory(row.category) ? row.category : "application_review";
  const timestamp = now();
  const dueSoon = hoursAfter(4);
  const slaState = status === "resolved" ? "resolved" : row.snoozedUntil && String(row.snoozedUntil) > timestamp ? "snoozed" : String(row.dueAt) <= timestamp ? "overdue" : String(row.dueAt) <= dueSoon ? "due_soon" : "on_track";
  return { id: String(row.id), sourceType: String(row.sourceType), sourceId: String(row.sourceId), applicationId: row.applicationId ? String(row.applicationId) : null, category, title: String(row.title), description: row.description ? String(row.description) : null, sourceStatus: String(row.sourceStatus), status, priority, assignedToUserId: row.assignedToUserId ? String(row.assignedToUserId) : null, assignedToEmail: row.assignedToEmail ? String(row.assignedToEmail) : null, dueAt: String(row.dueAt), snoozedUntil: row.snoozedUntil ? String(row.snoozedUntil) : null, resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null, sourceUpdatedAt: row.sourceUpdatedAt ? String(row.sourceUpdatedAt) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), brandName: row.brandName ? String(row.brandName) : null, companyName: row.companyName ? String(row.companyName) : null, applicantEmail: row.applicantEmail ? String(row.applicantEmail) : null, canonicalUrl: canonicalUrl(row), slaState };
}

export async function getPlatformWorkQueueSnapshot(actor: PlatformWorkActor) {
  await syncPlatformWorkQueue();
  const database = getCmsDatabase();
  const categories = visibleCategories(actor.capabilities);
  if (!categories.length) return { generatedAt: now(), metrics: { open: 0, mine: 0, unassigned: 0, overdue: 0, dueSoon: 0, urgent: 0 }, items: [], reminders: [], savedViews: [], staff: [] };
  const placeholders = categories.map((_, index) => `?${index + 1}`).join(",");
  const rows = await database.prepare(`SELECT w.id, w.source_type AS sourceType, w.source_id AS sourceId, w.application_id AS applicationId, w.category,
      w.title, w.description, w.source_status AS sourceStatus, w.status, w.priority, w.assigned_to_user_id AS assignedToUserId,
      w.assigned_to_email AS assignedToEmail, w.due_at AS dueAt, w.snoozed_until AS snoozedUntil, w.resolved_at AS resolvedAt,
      w.source_updated_at AS sourceUpdatedAt, w.created_at AS createdAt, w.updated_at AS updatedAt,
      a.brand_name AS brandName, a.company_name AS companyName, a.email AS applicantEmail
    FROM platform_work_items w LEFT JOIN platform_applications a ON a.id = w.application_id
    WHERE w.category IN (${placeholders}) ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.due_at ASC LIMIT 500`).bind(...categories).all<Row>();
  const items = rows.results.map(workItemFromRow);
  const reminders = await database.prepare(`SELECT r.id, r.work_item_id AS workItemId, r.reminder_type AS reminderType, r.status, r.generated_at AS generatedAt
    FROM platform_work_reminders r JOIN platform_work_items w ON w.id = r.work_item_id WHERE r.status = 'active' AND w.category IN (${placeholders}) ORDER BY CASE r.reminder_type WHEN 'overdue' THEN 0 ELSE 1 END, r.generated_at DESC LIMIT 100`).bind(...categories).all<Row>();
  const views = await database.prepare("SELECT id, name, filters_json AS filtersJson, created_at AS createdAt, updated_at AS updatedAt FROM platform_saved_work_views WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 20").bind(actor.userId).all<Row>();
  const listedStaff = await listPlatformMembers();
  const staff = listedStaff.some((member) => member.userId === actor.userId)
    ? listedStaff
    : [...listedStaff, { userId: actor.userId, email: actor.email, role: "platform_operator" as const, createdAt: now(), updatedAt: now() }];
  const active = items.filter((item) => item.status !== "resolved");
  return { generatedAt: now(), metrics: { open: active.length, mine: active.filter((item) => item.assignedToUserId === actor.userId).length, unassigned: active.filter((item) => !item.assignedToUserId).length, overdue: active.filter((item) => item.slaState === "overdue").length, dueSoon: active.filter((item) => item.slaState === "due_soon").length, urgent: active.filter((item) => item.priority === "urgent").length }, items, reminders: reminders.results, savedViews: views.results.map((view) => {
    let filters: Record<string, string> = {};
    try { filters = safeFilters(JSON.parse(String(view.filtersJson || "{}"))); } catch { filters = {}; }
    return { id: String(view.id), name: String(view.name), filters, createdAt: String(view.createdAt), updatedAt: String(view.updatedAt) };
  }), staff: staff.map(({ userId, email, role }) => ({ userId, email, role })), currentUserId: actor.userId };
}

async function getWorkItem(id: string) {
  return getCmsDatabase().prepare("SELECT id, category, status, updated_at AS updatedAt, assigned_to_user_id AS assignedToUserId FROM platform_work_items WHERE id = ?1").bind(id).first<{ id: string; category: string; status: string; updatedAt: string; assignedToUserId: string | null }>();
}

export async function updatePlatformWorkItem(id: string, input: { status?: string; priority?: string; assigneeUserId?: string | null; dueAt?: string | null; snoozedUntil?: string | null; expectedUpdatedAt?: string }, actor: PlatformWorkActor) {
  await ensurePlatformOperationsSchema();
  const database = getCmsDatabase();
  const current = await getWorkItem(id);
  if (!current || !validCategory(current.category)) throw new Error("WORK_ITEM_NOT_FOUND");
  if (!canManage(current.category, actor.capabilities)) throw new Error("FORBIDDEN");
  if (input.status !== undefined && !validStatus(input.status)) throw new Error("INVALID_WORK_STATUS");
  if (input.priority !== undefined && !validPriority(input.priority)) throw new Error("INVALID_WORK_PRIORITY");
  let assignee: PlatformMember | null = null;
  if (input.assigneeUserId) {
    assignee = input.assigneeUserId === actor.userId
      ? { userId: actor.userId, email: actor.email, role: "platform_operator", createdAt: now(), updatedAt: now() }
      : (await listPlatformMembers()).find((member) => member.userId === input.assigneeUserId) || null;
    if (!assignee) throw new Error("ASSIGNEE_NOT_FOUND");
  }
  const parseDate = (value: string | null | undefined, maximumDays: number) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now() + maximumDays * 86400000) throw new Error("INVALID_WORK_DATE");
    return parsed.toISOString();
  };
  const dueAt = parseDate(input.dueAt, 365);
  const snoozedUntil = parseDate(input.snoozedUntil, 30);
  if (snoozedUntil && snoozedUntil <= now()) throw new Error("INVALID_WORK_DATE");
  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => { updates.push(`${column} = ?${values.length + 1}`); values.push(value); };
  if (input.status !== undefined) add("status", input.status);
  if (input.priority !== undefined) add("priority", input.priority);
  if (input.assigneeUserId !== undefined) { add("assigned_to_user_id", assignee?.userId || null); add("assigned_to_email", assignee?.email || null); }
  if (dueAt !== undefined) add("due_at", dueAt);
  if (snoozedUntil !== undefined) add("snoozed_until", snoozedUntil);
  if (!updates.length) throw new Error("NO_WORK_ITEM_CHANGES");
  const timestamp = now();
  add("updated_at", timestamp);
  values.push(id);
  let where = `id = ?${values.length}`;
  if (input.expectedUpdatedAt) { values.push(input.expectedUpdatedAt); where += ` AND updated_at = ?${values.length}`; }
  const result = await database.prepare(`UPDATE platform_work_items SET ${updates.join(", ")} WHERE ${where}`).bind(...values).run();
  if (!changed(result)) throw new Error(input.expectedUpdatedAt ? "WORK_ITEM_CONFLICT" : "WORK_ITEM_NOT_FOUND");
  await database.prepare("INSERT INTO platform_work_item_events (id, work_item_id, action, from_status, to_status, actor_user_id, actor_email, metadata_json, created_at) VALUES (?1, ?2, 'work_item_updated', ?3, ?4, ?5, ?6, ?7, ?8)").bind(`work_event_${crypto.randomUUID()}`, id, current.status, input.status || current.status, actor.userId, actor.email, JSON.stringify({ priority: input.priority, assigneeUserId: input.assigneeUserId, dueAt, snoozedUntil }), timestamp).run();
  return true;
}

export async function bulkUpdatePlatformWorkItems(ids: string[], input: { action: "claim" | "unassign" | "snooze" | "priority" | "status"; priority?: string; status?: string; hours?: number }, actor: PlatformWorkActor) {
  const unique = [...new Set(ids.map((id) => text(id, 120)).filter(Boolean))].slice(0, 100);
  if (!unique.length) throw new Error("WORK_ITEMS_REQUIRED");
  const outcome = { succeeded: [] as string[], failed: [] as Array<{ id: string; code: string }> };
  for (const id of unique) {
    try {
      if (input.action === "claim") await updatePlatformWorkItem(id, { assigneeUserId: actor.userId, status: "in_progress" }, actor);
      else if (input.action === "unassign") await updatePlatformWorkItem(id, { assigneeUserId: null, status: "open" }, actor);
      else if (input.action === "snooze") await updatePlatformWorkItem(id, { status: "waiting", snoozedUntil: hoursAfter(Math.min(168, Math.max(1, Number(input.hours || 24)))) }, actor);
      else if (input.action === "priority") await updatePlatformWorkItem(id, { priority: input.priority }, actor);
      else await updatePlatformWorkItem(id, { status: input.status }, actor);
      outcome.succeeded.push(id);
    } catch (error) { outcome.failed.push({ id, code: error instanceof Error ? error.message : "WORK_ITEM_UPDATE_FAILED" }); }
  }
  return outcome;
}

function safeFilters(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, string> = {};
  for (const key of ["scope", "category", "status", "priority", "sla", "assignee"]) {
    const value = text(input[key], 80);
    if (value) result[key] = value;
  }
  return result;
}

export async function savePlatformWorkView(nameValue: string, filters: unknown, actor: PlatformWorkActor) {
  await ensurePlatformOperationsSchema();
  const name = text(nameValue, 60);
  if (name.length < 2) throw new Error("INVALID_VIEW_NAME");
  const database = getCmsDatabase();
  const existing = await database.prepare("SELECT id, created_at AS createdAt FROM platform_saved_work_views WHERE user_id = ?1 AND name = ?2").bind(actor.userId, name).first<{ id: string; createdAt: string }>();
  const timestamp = now();
  await database.prepare(`INSERT INTO platform_saved_work_views (id, user_id, name, filters_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(user_id, name) DO UPDATE SET filters_json = excluded.filters_json, updated_at = excluded.updated_at`).bind(existing?.id || `work_view_${crypto.randomUUID()}`, actor.userId, name, JSON.stringify(safeFilters(filters)), existing?.createdAt || timestamp, timestamp).run();
  return true;
}

export async function deletePlatformWorkView(id: string, actor: PlatformWorkActor) {
  await ensurePlatformOperationsSchema();
  const result = await getCmsDatabase().prepare("DELETE FROM platform_saved_work_views WHERE id = ?1 AND user_id = ?2").bind(id, actor.userId).run();
  if (!changed(result)) throw new Error("WORK_VIEW_NOT_FOUND");
  return true;
}

export async function dismissPlatformWorkReminder(id: string, actor: PlatformWorkActor) {
  await ensurePlatformOperationsSchema();
  const timestamp = now();
  const result = await getCmsDatabase().prepare(`UPDATE platform_work_reminders SET status = 'dismissed', dismissed_by = ?1, dismissed_at = ?2, updated_at = ?2
    WHERE id = ?3 AND status = 'active' AND work_item_id IN (SELECT id FROM platform_work_items WHERE category IN (${visibleCategories(actor.capabilities).map((_, index) => `?${index + 4}`).join(",") || "''"}))`).bind(actor.userId, timestamp, id, ...visibleCategories(actor.capabilities)).run();
  if (!changed(result)) throw new Error("REMINDER_NOT_FOUND");
  return true;
}

function csvCell(value: unknown) { const normalized = String(value ?? "").replace(/\r?\n/g, " "); return /[",]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized; }
export function platformWorkItemsCsv(items: PlatformWorkItem[]) {
  const rows = [["Task ID", "Category", "Title", "Merchant", "Status", "Priority", "Assignee", "SLA", "Due at", "Source status", "Application ID"], ...items.map((item) => [item.id, item.category, item.title, item.brandName || item.companyName || "", item.status, item.priority, item.assignedToEmail || "", item.slaState, item.dueAt, item.sourceStatus, item.applicationId || ""])];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
