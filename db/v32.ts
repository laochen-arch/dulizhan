import { ensureCmsSchema, getCmsDatabase, readSnapshot, recordAudit } from "./cms";

export type PlatformApplicationStatus = "submitted" | "reviewing" | "approved" | "rejected" | "site_created";

export type PlatformApplication = {
  id: string;
  userId: string | null;
  email: string;
  contactName: string;
  companyName: string;
  brandName: string;
  category: string;
  website: string | null;
  targetDomain: string | null;
  markets: string | null;
  productSource: string | null;
  notes: string | null;
  status: PlatformApplicationStatus;
  assignedSiteId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationRow = Omit<PlatformApplication, "status"> & { status: string };

function now() {
  return new Date().toISOString();
}

function statusValue(value: string): PlatformApplicationStatus {
  return ["submitted", "reviewing", "approved", "rejected", "site_created"].includes(value) ? value as PlatformApplicationStatus : "submitted";
}

function applicationFromRow(row: ApplicationRow): PlatformApplication {
  return { ...row, status: statusValue(row.status) };
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeEmail(value: unknown) {
  const email = clean(value, 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_APPLICATION");
  return email;
}

export async function createPlatformApplication(input: {
  userId?: string | null;
  email?: string;
  contactName?: string;
  companyName?: string;
  brandName?: string;
  category?: string;
  website?: string;
  targetDomain?: string;
  markets?: string;
  productSource?: string;
  notes?: string;
}) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const email = normalizeEmail(input.email);
  const contactName = clean(input.contactName, 120);
  const companyName = clean(input.companyName, 160);
  const brandName = clean(input.brandName, 160);
  const category = clean(input.category, 120);
  if (!contactName || !companyName || !brandName || !category) throw new Error("INVALID_APPLICATION");
  const timestamp = now();
  const id = `application_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO platform_applications
    (id, user_id, email, contact_name, company_name, brand_name, category, website, target_domain, markets, product_source, notes, status, assigned_site_id, admin_note, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'submitted', NULL, NULL, ?13, ?13)`)
    .bind(id, typeof input.userId === "string" ? input.userId : null, email, contactName, companyName, brandName, category,
      clean(input.website, 240) || null, clean(input.targetDomain, 240) || null, clean(input.markets, 240) || null,
      clean(input.productSource, 240) || null, clean(input.notes, 3000) || null, timestamp).run();
  return getPlatformApplication(id);
}

export async function getPlatformApplication(id: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT id, user_id AS userId, email, contact_name AS contactName,
      company_name AS companyName, brand_name AS brandName, category, website, target_domain AS targetDomain,
      markets, product_source AS productSource, notes, status, assigned_site_id AS assignedSiteId,
      admin_note AS adminNote, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_applications WHERE id = ?1`).bind(id).first<ApplicationRow>();
  return row ? applicationFromRow(row) : null;
}

export async function listPlatformApplications(filter: { userId?: string; email?: string; status?: string } = {}) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const predicates = ["1 = 1"];
  const values: string[] = [];
  if (filter.userId || filter.email) {
    predicates.push("(user_id = ?1 OR lower(email) = lower(?2))");
    values.push(filter.userId || "", filter.email || "");
  }
  const status = clean(filter.status, 40);
  if (status) {
    predicates.push(`status = ?${values.length + 1}`);
    values.push(status);
  }
  const query = `SELECT id, user_id AS userId, email, contact_name AS contactName,
      company_name AS companyName, brand_name AS brandName, category, website, target_domain AS targetDomain,
      markets, product_source AS productSource, notes, status, assigned_site_id AS assignedSiteId,
      admin_note AS adminNote, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_applications WHERE ${predicates.join(" AND ")} ORDER BY created_at DESC LIMIT 200`;
  const rows = await database.prepare(query).bind(...values).all<ApplicationRow>();
  return rows.results.map(applicationFromRow);
}

export async function updatePlatformApplication(id: string, input: { status?: string; assignedSiteId?: string | null; adminNote?: string | null }) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const current = await getPlatformApplication(id);
  if (!current) throw new Error("APPLICATION_NOT_FOUND");
  const status = input.status ? statusValue(input.status) : current.status;
  const assignedSiteId = input.assignedSiteId === undefined ? current.assignedSiteId : input.assignedSiteId || null;
  const adminNote = input.adminNote === undefined ? current.adminNote : clean(input.adminNote, 3000) || null;
  const timestamp = now();
  await database.prepare(`UPDATE platform_applications SET status = ?1, assigned_site_id = ?2, admin_note = ?3, updated_at = ?4 WHERE id = ?5`)
    .bind(status, assignedSiteId, adminNote, timestamp, id).run();
  return getPlatformApplication(id);
}

export type MerchantCollection = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  productIds: string[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MerchantRecommendation = {
  id: string;
  siteId: string;
  name: string;
  strategy: "manual" | "featured" | "category";
  sourceProductId: string | null;
  productIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MerchantCampaignSchedule = {
  id: string;
  siteId: string;
  targetType: "coupon" | "bundle" | "collection" | "recommendation";
  targetId: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "active" | "expired" | "cancelled";
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

function stringList(value: unknown) {
  return Array.from(new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 50) : []));
}

function slugValue(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function collectionFromRow(row: Record<string, unknown>): MerchantCollection {
  return { id: String(row.id), siteId: String(row.siteId), name: String(row.name), slug: String(row.slug), description: row.description ? String(row.description) : null, productIds: stringList(typeof row.productIds === "string" ? JSON.parse(row.productIds) : row.productIds), active: Number(row.active || 0) === 1, sortOrder: Number(row.sortOrder || 0), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}

function recommendationFromRow(row: Record<string, unknown>): MerchantRecommendation {
  const strategy = row.strategy === "featured" || row.strategy === "category" ? row.strategy : "manual";
  return { id: String(row.id), siteId: String(row.siteId), name: String(row.name), strategy, sourceProductId: row.sourceProductId ? String(row.sourceProductId) : null, productIds: stringList(typeof row.productIds === "string" ? JSON.parse(row.productIds) : row.productIds), active: Number(row.active || 0) === 1, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}

function scheduleFromRow(row: Record<string, unknown>): MerchantCampaignSchedule {
  const targetType = ["coupon", "bundle", "collection", "recommendation"].includes(String(row.targetType)) ? String(row.targetType) as MerchantCampaignSchedule["targetType"] : "coupon";
  const status = ["scheduled", "active", "expired", "cancelled"].includes(String(row.status)) ? String(row.status) as MerchantCampaignSchedule["status"] : "scheduled";
  return { id: String(row.id), siteId: String(row.siteId), targetType, targetId: String(row.targetId), startsAt: String(row.startsAt), endsAt: row.endsAt ? String(row.endsAt) : null, status, createdBy: String(row.createdBy), createdByEmail: String(row.createdByEmail), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}

export async function listMerchantCollections(siteId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, name, slug, description, product_ids AS productIds, active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM cms_collections WHERE site_id = ?1 ORDER BY sort_order ASC, created_at DESC`).bind(siteId).all<Record<string, unknown>>();
  return rows.results.map(collectionFromRow);
}

export async function saveMerchantCollection(siteId: string, input: { id?: string; name?: string; slug?: string; description?: string; productIds?: string[]; active?: boolean; sortOrder?: number }, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, true);
  const name = clean(input.name, 120);
  const slug = slugValue(clean(input.slug, 80) || name);
  const catalogIds = new Set(snapshot.catalog.map((product) => product.id));
  const productIds = stringList(input.productIds).filter((id) => catalogIds.has(id));
  if (!name || !slug || !productIds.length) throw new Error("INVALID_COLLECTION");
  const id = clean(input.id, 160) || `collection_${crypto.randomUUID()}`;
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_collections (id, site_id, name, slug, description, product_ids, active, sort_order, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
    ON CONFLICT(site_id, slug) DO UPDATE SET name = excluded.name, description = excluded.description, product_ids = excluded.product_ids, active = excluded.active, sort_order = excluded.sort_order, updated_at = excluded.updated_at`)
    .bind(id, siteId, name, slug, clean(input.description, 600) || null, JSON.stringify(productIds), input.active === false ? 0 : 1, Math.max(0, Math.floor(Number(input.sortOrder || 0))), timestamp).run();
  await recordAudit(database, siteId, { userId, email }, "collection.saved", "collection", id, { productIds });
  return listMerchantCollections(siteId);
}

export async function listMerchantRecommendations(siteId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, name, strategy, source_product_id AS sourceProductId, product_ids AS productIds, active, created_at AS createdAt, updated_at AS updatedAt FROM cms_recommendation_rules WHERE site_id = ?1 ORDER BY updated_at DESC`).bind(siteId).all<Record<string, unknown>>();
  return rows.results.map(recommendationFromRow);
}

export async function saveMerchantRecommendation(siteId: string, input: { id?: string; name?: string; strategy?: string; sourceProductId?: string; productIds?: string[]; category?: string; active?: boolean }, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, true);
  const name = clean(input.name, 120);
  const strategy = input.strategy === "featured" || input.strategy === "category" ? input.strategy : "manual";
  const productMap = new Map(snapshot.catalog.map((product) => [product.id, product]));
  let productIds = stringList(input.productIds).filter((id) => productMap.has(id));
  if (strategy === "featured" && !productIds.length) productIds = snapshot.catalog.filter((product) => product.featured && product.status === "active").map((product) => product.id).slice(0, 12);
  if (strategy === "category" && !productIds.length && input.category) productIds = snapshot.catalog.filter((product) => product.category.toLowerCase() === input.category?.trim().toLowerCase() && product.status === "active").map((product) => product.id).slice(0, 12);
  const sourceProductId = input.sourceProductId && productMap.has(input.sourceProductId) ? input.sourceProductId : null;
  if (!name || !productIds.length) throw new Error("INVALID_RECOMMENDATION");
  const id = clean(input.id, 160) || `recommendation_${crypto.randomUUID()}`;
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_recommendation_rules (id, site_id, name, strategy, source_product_id, product_ids, active, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, strategy = excluded.strategy, source_product_id = excluded.source_product_id, product_ids = excluded.product_ids, active = excluded.active, updated_at = excluded.updated_at`)
    .bind(id, siteId, name, strategy, sourceProductId, JSON.stringify(productIds), input.active === false ? 0 : 1, timestamp).run();
  await recordAudit(database, siteId, { userId, email }, "recommendation.saved", "recommendation", id, { strategy, productIds });
  return listMerchantRecommendations(siteId);
}

async function syncCampaignSchedules(siteId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, target_type AS targetType, target_id AS targetId, starts_at AS startsAt, ends_at AS endsAt, status, created_by AS createdBy, created_by_email AS createdByEmail, created_at AS createdAt, updated_at AS updatedAt FROM cms_campaign_schedules WHERE site_id = ?1 ORDER BY starts_at ASC`).bind(siteId).all<Record<string, unknown>>();
  const timestamp = now();
  for (const raw of rows.results) {
    const schedule = scheduleFromRow(raw);
    const status: MerchantCampaignSchedule["status"] = schedule.status === "cancelled" ? "cancelled" : Date.parse(schedule.startsAt) > Date.now() ? "scheduled" : schedule.endsAt && Date.parse(schedule.endsAt) <= Date.now() ? "expired" : "active";
    if (status !== schedule.status) await database.prepare("UPDATE cms_campaign_schedules SET status = ?1, updated_at = ?2 WHERE site_id = ?3 AND id = ?4").bind(status, timestamp, siteId, schedule.id).run();
    const enabled = status === "active" ? 1 : 0;
    if (schedule.targetType === "coupon") await database.prepare("UPDATE cms_coupons SET starts_at = ?1, ends_at = ?2, active = ?3, updated_at = ?4 WHERE site_id = ?5 AND id = ?6").bind(schedule.startsAt, schedule.endsAt, enabled, timestamp, siteId, schedule.targetId).run();
    if (schedule.targetType === "bundle") await database.prepare("UPDATE cms_bundles SET active = ?1, updated_at = ?2 WHERE site_id = ?3 AND id = ?4").bind(enabled, timestamp, siteId, schedule.targetId).run();
    if (schedule.targetType === "collection") await database.prepare("UPDATE cms_collections SET active = ?1, updated_at = ?2 WHERE site_id = ?3 AND id = ?4").bind(enabled, timestamp, siteId, schedule.targetId).run();
    if (schedule.targetType === "recommendation") await database.prepare("UPDATE cms_recommendation_rules SET active = ?1, updated_at = ?2 WHERE site_id = ?3 AND id = ?4").bind(enabled, timestamp, siteId, schedule.targetId).run();
  }
  const refreshed = await database.prepare(`SELECT id, site_id AS siteId, target_type AS targetType, target_id AS targetId, starts_at AS startsAt, ends_at AS endsAt, status, created_by AS createdBy, created_by_email AS createdByEmail, created_at AS createdAt, updated_at AS updatedAt FROM cms_campaign_schedules WHERE site_id = ?1 ORDER BY starts_at ASC`).bind(siteId).all<Record<string, unknown>>();
  return refreshed.results.map(scheduleFromRow);
}

async function assertCampaignTarget(database: ReturnType<typeof getCmsDatabase>, siteId: string, targetType: MerchantCampaignSchedule["targetType"], targetId: string) {
  const table = targetType === "coupon" ? "cms_coupons" : targetType === "bundle" ? "cms_bundles" : targetType === "collection" ? "cms_collections" : "cms_recommendation_rules";
  const row = await database.prepare(`SELECT id FROM ${table} WHERE site_id = ?1 AND id = ?2`).bind(siteId, targetId).first<{ id: string }>();
  if (!row) throw new Error("INVALID_SCHEDULE");
}

export async function listMerchantCampaignSchedules(siteId: string) {
  return syncCampaignSchedules(siteId);
}

export async function saveMerchantCampaignSchedule(siteId: string, input: { id?: string; targetType?: string; targetId?: string; startsAt?: string; endsAt?: string | null }, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const targetType = ["coupon", "bundle", "collection", "recommendation"].includes(String(input.targetType)) ? String(input.targetType) as MerchantCampaignSchedule["targetType"] : null;
  const targetId = clean(input.targetId, 160);
  const startsAt = clean(input.startsAt, 60);
  const endsAt = clean(input.endsAt, 60) || null;
  if (!targetType || !targetId || !startsAt || Number.isNaN(Date.parse(startsAt)) || (endsAt && Number.isNaN(Date.parse(endsAt))) || (endsAt && Date.parse(endsAt) <= Date.parse(startsAt))) throw new Error("INVALID_SCHEDULE");
  await assertCampaignTarget(database, siteId, targetType, targetId);
  const id = clean(input.id, 160) || `schedule_${crypto.randomUUID()}`;
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_campaign_schedules (id, site_id, target_type, target_id, starts_at, ends_at, status, created_by, created_by_email, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'scheduled', ?7, ?8, ?9, ?9)
    ON CONFLICT(id) DO UPDATE SET target_type = excluded.target_type, target_id = excluded.target_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = excluded.updated_at`)
    .bind(id, siteId, targetType, targetId, new Date(startsAt).toISOString(), endsAt ? new Date(endsAt).toISOString() : null, userId, email, timestamp).run();
  await recordAudit(database, siteId, { userId, email }, "campaign_schedule.saved", "campaign_schedule", id, { targetType, targetId, startsAt, endsAt });
  return listMerchantCampaignSchedules(siteId);
}

export async function cancelMerchantCampaignSchedule(siteId: string, id: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const result = await database.prepare("UPDATE cms_campaign_schedules SET status = 'cancelled', updated_at = ?1 WHERE site_id = ?2 AND id = ?3").bind(now(), siteId, id).run();
  if (Number((result as { meta?: { changes?: number } }).meta?.changes || 0) !== 1) throw new Error("INVALID_SCHEDULE");
  await recordAudit(database, siteId, { userId, email }, "campaign_schedule.cancelled", "campaign_schedule", id, {});
  return listMerchantCampaignSchedules(siteId);
}

export async function getMerchantMarketing(siteId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const [collections, recommendations, schedules] = await Promise.all([listMerchantCollections(siteId), listMerchantRecommendations(siteId), listMerchantCampaignSchedules(siteId)]);
  return { collections, recommendations, schedules };
}
