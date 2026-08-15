import { ensureCmsSchema, getCmsDatabase, getMember, getSiteLaunchChecks, recordAudit, type CmsLaunchCheck, type CmsRole } from "./cms";

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export const V22_DELIVERY_STEPS = [
  { key: "intake", label: "Client intake" },
  { key: "import", label: "Import catalog" },
  { key: "media", label: "Bind media" },
  { key: "domain", label: "Connect domain" },
  { key: "checks", label: "Run checks" },
  { key: "preview", label: "Review preview" },
  { key: "publish", label: "Publish" },
] as const;

export type V22DeliveryStep = typeof V22_DELIVERY_STEPS[number]["key"];
export type V22DeliveryStatus = "in_progress" | "blocked" | "ready" | "published" | "rolled_back";

export type CmsDeliveryRun = {
  siteId: string;
  runId: string;
  status: V22DeliveryStatus;
  currentStep: V22DeliveryStep;
  packageName: string | null;
  packageSummary: Record<string, unknown> | null;
  importRevisionId: string | null;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CmsOperationEvent = {
  id: string;
  siteId: string;
  category: string;
  action: string;
  status: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  attempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DeliveryRow = {
  siteId: string;
  runId: string;
  status: string;
  currentStep: string;
  packageName: string | null;
  packageSummary: string | null;
  importRevisionId: string | null;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function deliveryFromRow(row: DeliveryRow): CmsDeliveryRun {
  const step = V22_DELIVERY_STEPS.some((item) => item.key === row.currentStep) ? row.currentStep as V22DeliveryStep : "intake";
  const status = ["in_progress", "blocked", "ready", "published", "rolled_back"].includes(row.status) ? row.status as V22DeliveryStatus : "in_progress";
  return {
    siteId: row.siteId,
    runId: row.runId,
    status,
    currentStep: step,
    packageName: row.packageName,
    packageSummary: parseJson<Record<string, unknown> | null>(row.packageSummary, null),
    importRevisionId: row.importRevisionId,
    lastError: row.lastError,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const deliverySelect = `site_id AS siteId, run_id AS runId, status, current_step AS currentStep,
  package_name AS packageName, package_summary AS packageSummary, import_revision_id AS importRevisionId,
  last_error AS lastError, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt`;

export async function getDeliveryRun(siteId: string, userId: string, email: string): Promise<CmsDeliveryRun> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await getMember(siteId, userId, email);
  const row = await database.prepare(`SELECT ${deliverySelect} FROM cms_delivery_runs WHERE site_id = ?1`).bind(siteId).first<DeliveryRow>();
  if (row) return deliveryFromRow(row);
  const timestamp = now();
  const runId = `delivery_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO cms_delivery_runs (site_id, run_id, status, current_step, package_name, package_summary, import_revision_id, last_error, created_by, created_at, updated_at)
    VALUES (?1, ?2, 'in_progress', 'intake', NULL, NULL, NULL, NULL, ?3, ?4, ?4)`).bind(siteId, runId, userId, timestamp).run();
  return { siteId, runId, status: "in_progress", currentStep: "intake", packageName: null, packageSummary: null, importRevisionId: null, lastError: null, createdBy: userId, createdAt: timestamp, updatedAt: timestamp };
}

export async function updateDeliveryRun(
  siteId: string,
  patch: { currentStep?: string; status?: string; packageName?: string | null; packageSummary?: Record<string, unknown> | null; importRevisionId?: string | null; lastError?: string | null },
  userId: string,
  email: string,
) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const current = await getDeliveryRun(siteId, userId, email);
  if (patch.currentStep !== undefined && !V22_DELIVERY_STEPS.some((item) => item.key === patch.currentStep)) throw new Error("INVALID_DELIVERY_STEP");
  if (patch.status !== undefined && !["in_progress", "blocked", "ready", "published", "rolled_back"].includes(patch.status)) throw new Error("INVALID_DELIVERY_STATUS");
  const nextStep = patch.currentStep === undefined ? current.currentStep : patch.currentStep as V22DeliveryStep;
  const nextStatus = patch.status === undefined ? current.status : patch.status as V22DeliveryStatus;
  const nextPackageName = patch.packageName === undefined ? current.packageName : patch.packageName?.trim().slice(0, 160) || null;
  const nextSummary = patch.packageSummary === undefined ? current.packageSummary : patch.packageSummary;
  const nextRevision = patch.importRevisionId === undefined ? current.importRevisionId : patch.importRevisionId;
  const nextError = patch.lastError === undefined ? current.lastError : patch.lastError?.trim().slice(0, 1000) || null;
  const timestamp = now();
  await database.prepare(`UPDATE cms_delivery_runs SET status = ?1, current_step = ?2, package_name = ?3, package_summary = ?4, import_revision_id = ?5, last_error = ?6, updated_at = ?7 WHERE site_id = ?8`)
    .bind(nextStatus, nextStep, nextPackageName, nextSummary ? JSON.stringify(nextSummary).slice(0, 8000) : null, nextRevision, nextError, timestamp, siteId).run();
  await recordAudit(database, siteId, { userId, email }, "delivery.run_updated", "delivery_run", current.runId, { fromStep: current.currentStep, toStep: nextStep, status: nextStatus, packageName: nextPackageName });
  return getDeliveryRun(siteId, userId, email);
}

function operationFromRow(row: Record<string, unknown>): CmsOperationEvent {
  return {
    id: String(row.id),
    siteId: String(row.siteId),
    category: String(row.category),
    action: String(row.action),
    status: String(row.status),
    severity: String(row.severity),
    entityType: row.entityType as string | null,
    entityId: row.entityId as string | null,
    message: String(row.message),
    metadata: parseJson<Record<string, unknown> | null>(row.metadata as string | null, null),
    attempts: Number(row.attempts || 0),
    lastAttemptAt: row.lastAttemptAt as string | null,
    nextRetryAt: row.nextRetryAt as string | null,
    resolvedAt: row.resolvedAt as string | null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

const operationSelect = `id, site_id AS siteId, category, action, status, severity, entity_type AS entityType,
  entity_id AS entityId, message, metadata, attempts, last_attempt_at AS lastAttemptAt,
  next_retry_at AS nextRetryAt, resolved_at AS resolvedAt, created_at AS createdAt, updated_at AS updatedAt`;

export async function listOperationEvents(siteId: string, userId: string, email: string, status?: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await getMember(siteId, userId, email);
  const filter = status ? " AND status = ?2" : "";
  const statement = database.prepare(`SELECT ${operationSelect} FROM cms_operation_events WHERE site_id = ?1${filter} ORDER BY created_at DESC LIMIT 150`);
  const rows = status ? await statement.bind(siteId, status).all<Record<string, unknown>>() : await statement.bind(siteId).all<Record<string, unknown>>();
  return rows.results.map(operationFromRow);
}

export async function resolveOperationEvent(siteId: string, eventId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const timestamp = now();
  const result = await database.prepare("UPDATE cms_operation_events SET status = 'resolved', resolved_at = ?1, updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND status <> 'resolved'")
    .bind(timestamp, eventId, siteId).run();
  const changes = Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  if (!changes) throw new Error("OPERATION_EVENT_NOT_FOUND");
  await recordAudit(database, siteId, { userId, email }, "operation.resolved", "operation_event", eventId);
  return listOperationEvents(siteId, userId, email);
}

export async function getProductionReadiness(siteId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await getMember(siteId, userId, email);
  const [launch, delivery, health, events] = await Promise.all([
    getSiteLaunchChecks(siteId, userId, email),
    getDeliveryRun(siteId, userId, email),
    database.prepare("SELECT check_key AS key, status, detail, checked_at AS checkedAt FROM cms_health_checks WHERE site_id = ?1 ORDER BY check_key").bind(siteId).all<{ key: string; status: string; detail: string; checkedAt: string }>(),
    listOperationEvents(siteId, userId, email),
  ]);
  const healthChecks = health.results;
  const blockers: Array<{ key: string; label: string; detail: string; source: "launch" | "health" | "operations" }> = launch.checks
    .filter((check: CmsLaunchCheck) => check.required !== false && !check.done)
    .map((check: CmsLaunchCheck) => ({ key: check.key, label: check.label, detail: check.detail, source: "launch" }));
  healthChecks.filter((check) => check.status !== "ready").forEach((check) => blockers.push({ key: `health.${check.key}`, label: `${check.key} health check`, detail: check.detail, source: "health" }));
  const failedOperations = events.filter((event) => event.status === "failed");
  failedOperations.slice(0, 10).forEach((event) => blockers.push({ key: `operation.${event.id}`, label: event.message, detail: "Resolve this operation event before the next production release.", source: "operations" }));
  const total = launch.progress.total + Math.max(healthChecks.length, 1) + Math.min(failedOperations.length, 10);
  const done = launch.progress.done + healthChecks.filter((check) => check.status === "ready").length + Math.max(0, Math.min(10, 10 - failedOperations.length));
  return {
    score: Math.max(0, Math.min(100, Math.round(done / Math.max(total, 1) * 100))),
    blockers,
    launch,
    health: healthChecks,
    delivery,
    openOperations: events.filter((event) => event.status !== "resolved").length,
    recentOperations: events.slice(0, 25),
  };
}

export function canManageDelivery(role?: CmsRole) {
  return role === "owner" || role === "editor";
}
