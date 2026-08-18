import { ensureCmsSchema, getCmsDatabase, getMediaBucket, insertAsset, importClientData, normalizeDomain, readSnapshot, recordAudit } from "./cms";
import { getPlatformTemplate } from "../app/platform/template-catalog";

export type PlatformApplicationStatus = "draft" | "submitted" | "reviewing" | "needs_info" | "approved" | "rejected" | "site_created";
export type PlatformApplicationActorRole = "platform" | "applicant";

export type PlatformProductImport = {
  products?: unknown[];
  productCsv?: string;
  assetBindings?: Record<string, string>;
};

export type PlatformApplication = {
  id: string;
  userId: string | null;
  email: string;
  applicantType: "business" | "individual";
  contactName: string;
  phone: string | null;
  companyName: string;
  brandName: string;
  category: string;
  website: string | null;
  targetDomain: string | null;
  markets: string | null;
  productSource: string | null;
  notes: string | null;
  templateSiteId: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  homeCopy: string | null;
  productImport: PlatformProductImport | null;
  agreementVersion: string | null;
  agreementAcceptedAt: string | null;
  locale: "en-US" | "zh-CN";
  referralCode: string | null;
  status: PlatformApplicationStatus;
  assignedSiteId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformApplicationEvent = {
  id: string;
  applicationId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type PlatformDomainRequest = {
  id: string;
  applicationId: string;
  siteId: string | null;
  hostname: string;
  status: "pending" | "reviewing" | "active" | "failed";
  note: string | null;
  requestedBy: string;
  requestedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformApplicationAsset = {
  id: string;
  applicationId: string;
  assetKey: string;
  kind: string;
  url: string;
  objectKey: string | null;
  alt: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
};

export type PlatformSupportTicket = {
  id: string;
  applicationId: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  createdBy: string;
  createdByEmail: string;
  assignedTo: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformApplicationNotification = {
  id: string;
  applicationId: string;
  dedupeKey: string;
  eventType: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationRow = {
  id: string;
  userId: string | null;
  email: string;
  applicantType: string;
  contactName: string;
  phone: string | null;
  companyName: string;
  brandName: string;
  category: string;
  website: string | null;
  targetDomain: string | null;
  markets: string | null;
  productSource: string | null;
  notes: string | null;
  templateSiteId: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  homeCopy: string | null;
  productImportPayload: string | null;
  agreementVersion: string | null;
  agreementAcceptedAt: string | null;
  locale: string | null;
  referralCode: string | null;
  status: string;
  assignedSiteId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationActor = { userId: string; email: string; role: PlatformApplicationActorRole };

const APPLICATION_SELECT = `SELECT id, user_id AS userId, email, applicant_type AS applicantType,
    contact_name AS contactName, phone, company_name AS companyName, brand_name AS brandName, category,
    website, target_domain AS targetDomain, markets, product_source AS productSource, notes,
    template_site_id AS templateSiteId, brand_logo_url AS brandLogoUrl, brand_primary_color AS brandPrimaryColor,
    home_copy AS homeCopy, product_import_payload AS productImportPayload, agreement_version AS agreementVersion,
    agreement_accepted_at AS agreementAcceptedAt, locale, referral_code AS referralCode, status, assigned_site_id AS assignedSiteId,
    admin_note AS adminNote, created_at AS createdAt, updated_at AS updatedAt
  FROM platform_applications`;

function now() {
  return new Date().toISOString();
}

function statusValue(value: string): PlatformApplicationStatus {
  return ["draft", "submitted", "reviewing", "needs_info", "approved", "rejected", "site_created"].includes(value) ? value as PlatformApplicationStatus : "submitted";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeEmail(value: unknown) {
  const email = clean(value, 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_APPLICATION");
  return email;
}

function optionalWebsite(value: unknown) {
  const raw = clean(value, 240);
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!(url.protocol === "https:" || url.protocol === "http:")) throw new Error("INVALID_APPLICATION");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("INVALID_APPLICATION");
  }
}

function optionalPhone(value: unknown) {
  const phone = clean(value, 40);
  if (phone && !/^[0-9+().\-\s]{7,30}$/.test(phone)) throw new Error("INVALID_APPLICATION");
  return phone || null;
}

function parseProductImport(value: string | null): PlatformProductImport | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const products = Array.isArray(parsed.products) ? parsed.products.slice(0, 200) : undefined;
    const productCsv = typeof parsed.productCsv === "string" ? parsed.productCsv.slice(0, 500_000) : undefined;
    const assetBindings = parsed.assetBindings && typeof parsed.assetBindings === "object" && !Array.isArray(parsed.assetBindings)
      ? Object.fromEntries(Object.entries(parsed.assetBindings as Record<string, unknown>).filter(([, item]) => typeof item === "string").slice(0, 200)) as Record<string, string>
      : undefined;
    if (!products && !productCsv && !assetBindings) return null;
    return { products, productCsv, assetBindings };
  } catch {
    return null;
  }
}

function sanitizeProductImport(value: unknown): PlatformProductImport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return parseProductImport(JSON.stringify({ products: input.products, productCsv: input.productCsv, assetBindings: input.assetBindings }));
}

function applicationFromRow(row: ApplicationRow): PlatformApplication {
  return {
    id: row.id,
    userId: row.userId || null,
    email: row.email,
    applicantType: row.applicantType === "individual" ? "individual" : "business",
    contactName: row.contactName,
    phone: row.phone || null,
    companyName: row.companyName,
    brandName: row.brandName,
    category: row.category,
    website: row.website || null,
    targetDomain: row.targetDomain || null,
    markets: row.markets || null,
    productSource: row.productSource || null,
    notes: row.notes || null,
    templateSiteId: row.templateSiteId || "default",
    brandLogoUrl: row.brandLogoUrl || null,
    brandPrimaryColor: row.brandPrimaryColor || null,
    homeCopy: row.homeCopy || null,
    productImport: parseProductImport(row.productImportPayload),
    agreementVersion: row.agreementVersion || null,
    agreementAcceptedAt: row.agreementAcceptedAt || null,
    locale: row.locale === "zh-CN" ? "zh-CN" : "en-US",
    referralCode: row.referralCode || null,
    status: statusValue(row.status),
    assignedSiteId: row.assignedSiteId || null,
    adminNote: row.adminNote || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function hashAccessToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function createAccessToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

async function recordApplicationEvent(database: ReturnType<typeof getCmsDatabase>, applicationId: string, input: { eventType: string; fromStatus?: string | null; toStatus?: string | null; note?: string | null; actor?: ApplicationActor; payload?: Record<string, unknown> }) {
  await database.prepare(`INSERT INTO platform_application_events
    (id, application_id, event_type, from_status, to_status, note, actor_user_id, actor_email, payload, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(`application_event_${crypto.randomUUID()}`, applicationId, input.eventType, input.fromStatus || null, input.toStatus || null,
      input.note || null, input.actor?.userId || null, input.actor?.email || null, input.payload ? JSON.stringify(input.payload) : null, now()).run();
}

export async function recordPlatformApplicationEvent(applicationId: string, input: { eventType: string; fromStatus?: string | null; toStatus?: string | null; note?: string | null; actor?: ApplicationActor; payload?: Record<string, unknown> }) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await recordApplicationEvent(database, applicationId, input);
}

export async function createPlatformApplication(input: {
  userId?: string | null;
  email?: string;
  draft?: boolean;
  applicantType?: string;
  contactName?: string;
  phone?: string;
  companyName?: string;
  brandName?: string;
  category?: string;
  website?: string;
  targetDomain?: string;
  markets?: string;
  productSource?: string;
  notes?: string;
  templateSiteId?: string;
  brandLogoUrl?: string;
  brandPrimaryColor?: string;
  homeCopy?: string;
  productImport?: unknown;
  agreementAccepted?: boolean;
  agreementVersion?: string;
  locale?: string;
  referralCode?: string;
}) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const email = normalizeEmail(input.email);
  const applicantType = input.applicantType === "individual" ? "individual" : "business";
  const contactName = clean(input.contactName, 120);
  const companyName = clean(input.companyName, 160);
  const brandName = clean(input.brandName, 160);
  const category = clean(input.category, 120);
  const phone = optionalPhone(input.phone);
  const website = optionalWebsite(input.website);
  const rawTargetDomain = clean(input.targetDomain, 240);
  const targetDomain = rawTargetDomain ? normalizeDomain(rawTargetDomain) : null;
  if (rawTargetDomain && !targetDomain) throw new Error("INVALID_APPLICATION");
  const templateSiteId = /^[a-zA-Z0-9_-]{2,80}$/.test(clean(input.templateSiteId, 80)) ? clean(input.templateSiteId, 80) : "default";
  if (!getPlatformTemplate(templateSiteId)) throw new Error("INVALID_TEMPLATE");
  const brandLogoUrl = optionalWebsite(input.brandLogoUrl);
  const brandPrimaryColor = clean(input.brandPrimaryColor, 20);
  const homeCopy = clean(input.homeCopy, 800) || null;
  const productImport = sanitizeProductImport(input.productImport);
  if (brandPrimaryColor && !/^#[0-9a-f]{6}$/i.test(brandPrimaryColor)) throw new Error("INVALID_APPLICATION");
  const draft = input.draft === true;
  if (!contactName || !companyName || !brandName || !category) throw new Error("INVALID_APPLICATION");
  if (!draft && input.agreementAccepted !== true) throw new Error("AGREEMENT_REQUIRED");
  const duplicate = await database.prepare(`SELECT id FROM platform_applications
    WHERE lower(email) = lower(?1) AND status IN ('submitted', 'reviewing', 'needs_info', 'approved', 'site_created')
    ORDER BY created_at DESC LIMIT 1`).bind(email).first<{ id: string }>();
  if (duplicate) throw new Error(`DUPLICATE_APPLICATION:${duplicate.id}`);
  const timestamp = now();
  const id = `application_${crypto.randomUUID()}`;
  const accessToken = createAccessToken();
  const accessTokenHash = await hashAccessToken(accessToken);
  const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const agreementVersion = draft ? null : clean(input.agreementVersion, 40) || "platform-v1";
  const locale = input.locale === "zh-CN" ? "zh-CN" : "en-US";
  const referralCode = clean(input.referralCode, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "") || null;
  await database.prepare(`INSERT INTO platform_applications
    (id, user_id, email, applicant_type, contact_name, phone, company_name, brand_name, category, website, target_domain, markets, product_source, notes,
     template_site_id, brand_logo_url, brand_primary_color, home_copy, product_import_payload, access_token_hash, access_token_expires_at,
     agreement_version, agreement_accepted_at, locale, referral_code, status, assigned_site_id, admin_note, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, NULL, NULL, ?27, ?27)`)
    .bind(id, typeof input.userId === "string" ? input.userId : null, email, applicantType, contactName, phone, companyName, brandName, category,
      website, targetDomain, clean(input.markets, 240) || null, clean(input.productSource, 240) || null, clean(input.notes, 3000) || null,
      templateSiteId, brandLogoUrl, brandPrimaryColor || null, homeCopy, productImport ? JSON.stringify(productImport) : null, accessTokenHash, accessTokenExpiresAt,
      agreementVersion, draft && input.agreementAccepted === true ? timestamp : null, locale, referralCode, draft ? "draft" : "submitted", timestamp).run();
  await recordApplicationEvent(database, id, { eventType: draft ? "draft_saved" : "submitted", toStatus: draft ? "draft" : "submitted", actor: input.userId ? { userId: input.userId, email, role: "applicant" } : undefined, payload: { applicantType, templateSiteId } });
  const application = await getPlatformApplication(id);
  if (!application) throw new Error("APPLICATION_NOT_CREATED");
  return { application, accessToken, statusUrl: `/platform/applications?application=${encodeURIComponent(id)}&token=${encodeURIComponent(accessToken)}` };
}

export async function getPlatformApplication(id: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`${APPLICATION_SELECT} WHERE id = ?1`).bind(id).first<ApplicationRow>();
  return row ? applicationFromRow(row) : null;
}

export async function getPlatformApplicationForAccess(id: string, token: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const hash = await hashAccessToken(token);
  const row = await database.prepare(`${APPLICATION_SELECT}
    WHERE id = ?1 AND access_token_hash = ?2 AND (access_token_expires_at IS NULL OR access_token_expires_at > ?3)`).bind(id, hash, now()).first<ApplicationRow>();
  return row ? applicationFromRow(row) : null;
}

export async function listPlatformApplications(filter: { userId?: string; email?: string; status?: string } = {}) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const predicates = ["1 = 1"];
  const values: string[] = [];
  if (filter.userId || filter.email) {
    predicates.push(`(user_id = ?${values.length + 1} OR lower(email) = lower(?${values.length + 2}))`);
    values.push(filter.userId || "", filter.email || "");
  }
  const status = clean(filter.status, 40);
  if (status) {
    predicates.push(`status = ?${values.length + 1}`);
    values.push(status);
  }
  const rows = await database.prepare(`${APPLICATION_SELECT} WHERE ${predicates.join(" AND ")} ORDER BY created_at DESC LIMIT 200`).bind(...values).all<ApplicationRow>();
  return rows.results.map(applicationFromRow);
}

export async function updatePlatformApplication(id: string, input: {
  status?: string;
  assignedSiteId?: string | null;
  adminNote?: string | null;
  applicantType?: string;
  contactName?: string;
  phone?: string | null;
  companyName?: string;
  brandName?: string;
  category?: string;
  website?: string | null;
  targetDomain?: string | null;
  markets?: string | null;
  productSource?: string | null;
  notes?: string | null;
  templateSiteId?: string;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  homeCopy?: string | null;
  productImport?: unknown;
  agreementAccepted?: boolean;
  agreementVersion?: string | null;
  locale?: string;
  referralCode?: string | null;
}, actor?: ApplicationActor) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const current = await getPlatformApplication(id);
  if (!current) throw new Error("APPLICATION_NOT_FOUND");
  const status = input.status ? statusValue(input.status) : current.status;
  if (actor?.role === "applicant" && !["draft", "submitted"].includes(status)) throw new Error("INVALID_STATUS_TRANSITION");
  if (actor?.role === "applicant" && !["draft", "needs_info", "rejected"].includes(current.status)) throw new Error("APPLICATION_NOT_EDITABLE");
  if (actor?.role === "applicant" && status === "submitted" && input.agreementAccepted !== true && !current.agreementAcceptedAt) throw new Error("AGREEMENT_REQUIRED");
  const allowedTransitions: Record<string, string[]> = {
    draft: ["draft", "submitted"],
    submitted: ["submitted", "reviewing", "needs_info", "approved", "rejected"],
    reviewing: ["reviewing", "needs_info", "approved", "rejected"],
    needs_info: ["needs_info", "draft", "submitted", "reviewing", "approved", "rejected"],
    approved: ["approved", "site_created", "rejected"],
    rejected: ["rejected", "draft", "reviewing", "needs_info", "approved"],
    site_created: ["site_created"],
  };
  const creatingSite = status === "site_created" && Boolean(input.assignedSiteId || current.assignedSiteId) && actor?.role === "platform";
  if (status === "site_created" && !(input.assignedSiteId || current.assignedSiteId)) throw new Error("SITE_REQUIRED_FOR_CREATED_STATUS");
  if (!creatingSite && !allowedTransitions[current.status]?.includes(status)) throw new Error("INVALID_STATUS_TRANSITION");
  if (current.status === "site_created" && input.assignedSiteId === null) throw new Error("SITE_REQUIRED_FOR_CREATED_STATUS");
  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => { updates.push(`${column} = ?${values.length + 1}`); values.push(value); };
  if (input.status !== undefined) add("status", status);
  if (input.assignedSiteId !== undefined) add("assigned_site_id", input.assignedSiteId || null);
  if (input.adminNote !== undefined) add("admin_note", clean(input.adminNote, 3000) || null);
  if (input.applicantType !== undefined) add("applicant_type", input.applicantType === "individual" ? "individual" : "business");
  if (input.contactName !== undefined) add("contact_name", clean(input.contactName, 120));
  if (input.phone !== undefined) add("phone", optionalPhone(input.phone));
  if (input.companyName !== undefined) add("company_name", clean(input.companyName, 160));
  if (input.brandName !== undefined) add("brand_name", clean(input.brandName, 160));
  if (input.category !== undefined) add("category", clean(input.category, 120));
  if (input.website !== undefined) add("website", optionalWebsite(input.website));
  if (input.targetDomain !== undefined) {
    const rawTargetDomain = clean(input.targetDomain, 240);
    const targetDomain = rawTargetDomain ? normalizeDomain(rawTargetDomain) : null;
    if (rawTargetDomain && !targetDomain) throw new Error("INVALID_APPLICATION");
    add("target_domain", targetDomain);
  }
  if (input.markets !== undefined) add("markets", clean(input.markets, 240) || null);
  if (input.productSource !== undefined) add("product_source", clean(input.productSource, 240) || null);
  if (input.notes !== undefined) add("notes", clean(input.notes, 3000) || null);
  if (input.templateSiteId !== undefined) {
    const templateSiteId = /^[a-zA-Z0-9_-]{2,80}$/.test(clean(input.templateSiteId, 80)) ? clean(input.templateSiteId, 80) : "default";
    if (!getPlatformTemplate(templateSiteId)) throw new Error("INVALID_TEMPLATE");
    add("template_site_id", templateSiteId);
  }
  if (input.brandLogoUrl !== undefined) add("brand_logo_url", optionalWebsite(input.brandLogoUrl));
  if (input.brandPrimaryColor !== undefined) {
    const color = clean(input.brandPrimaryColor, 20);
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("INVALID_APPLICATION");
    add("brand_primary_color", color || null);
  }
  if (input.homeCopy !== undefined) add("home_copy", clean(input.homeCopy, 800) || null);
  if (input.productImport !== undefined) {
    const productImport = sanitizeProductImport(input.productImport);
    add("product_import_payload", productImport ? JSON.stringify(productImport) : null);
  }
  if (input.agreementVersion !== undefined) add("agreement_version", clean(input.agreementVersion, 40) || null);
  if (input.agreementAccepted === true) add("agreement_accepted_at", now());
  if (input.locale !== undefined) add("locale", input.locale === "zh-CN" ? "zh-CN" : "en-US");
  if (input.referralCode !== undefined) add("referral_code", clean(input.referralCode, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "") || null);
  if (!updates.length) return current;
  const timestamp = now();
  updates.push(`updated_at = ?${values.length + 1}`);
  values.push(timestamp);
  values.push(id);
  await database.prepare(`UPDATE platform_applications SET ${updates.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
  await recordApplicationEvent(database, id, {
    eventType: status !== current.status ? "status_changed" : "application_updated",
    fromStatus: current.status,
    toStatus: status,
    note: input.adminNote || null,
    actor,
    payload: { assignedSiteId: input.assignedSiteId ?? current.assignedSiteId },
  });
  if (actor && current.assignedSiteId) await recordAudit(database, current.assignedSiteId, { userId: actor.userId, email: actor.email }, "platform.application.updated", "platform_application", id, { status, actorRole: actor.role });
  return getPlatformApplication(id);
}

export async function listPlatformApplicationEvents(applicationId: string): Promise<PlatformApplicationEvent[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, application_id AS applicationId, event_type AS eventType, from_status AS fromStatus,
      to_status AS toStatus, note, actor_user_id AS actorUserId, actor_email AS actorEmail, payload, created_at AS createdAt
    FROM platform_application_events WHERE application_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(applicationId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ id: String(row.id), applicationId: String(row.applicationId), eventType: String(row.eventType), fromStatus: row.fromStatus ? String(row.fromStatus) : null, toStatus: row.toStatus ? String(row.toStatus) : null, note: row.note ? String(row.note) : null, actorUserId: row.actorUserId ? String(row.actorUserId) : null, actorEmail: row.actorEmail ? String(row.actorEmail) : null, payload: typeof row.payload === "string" ? parseRecord(row.payload) : null, createdAt: String(row.createdAt) }));
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function listPlatformDomainRequests(applicationId: string): Promise<PlatformDomainRequest[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, application_id AS applicationId, site_id AS siteId, hostname, status, note,
      requested_by AS requestedBy, requested_by_email AS requestedByEmail, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_domain_requests WHERE application_id = ?1 ORDER BY created_at DESC`).bind(applicationId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ id: String(row.id), applicationId: String(row.applicationId), siteId: row.siteId ? String(row.siteId) : null, hostname: String(row.hostname), status: ["reviewing", "active", "failed"].includes(String(row.status)) ? String(row.status) as PlatformDomainRequest["status"] : "pending", note: row.note ? String(row.note) : null, requestedBy: String(row.requestedBy), requestedByEmail: String(row.requestedByEmail), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }));
}

export async function createPlatformDomainRequest(applicationId: string, input: { hostname?: string; siteId?: string | null }, actor: ApplicationActor) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const hostname = normalizeDomain(clean(input.hostname, 253));
  if (!hostname) throw new Error("INVALID_DOMAIN");
  const existing = await database.prepare(`SELECT id FROM platform_domain_requests WHERE hostname = ?1 AND status IN ('pending', 'reviewing', 'active') LIMIT 1`).bind(hostname).first<{ id: string }>();
  if (existing) throw new Error("DOMAIN_REQUEST_EXISTS");
  const timestamp = now();
  await database.prepare(`INSERT INTO platform_domain_requests (id, application_id, site_id, hostname, status, note, requested_by, requested_by_email, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'pending', NULL, ?5, ?6, ?7, ?7)`).bind(`domain_request_${crypto.randomUUID()}`, applicationId, input.siteId || null, hostname, actor.userId, actor.email, timestamp).run();
  await recordApplicationEvent(database, applicationId, { eventType: "domain_requested", actor, payload: { hostname } });
  return listPlatformDomainRequests(applicationId);
}

export async function updatePlatformDomainRequest(applicationId: string, requestId: string, input: { status?: string; note?: string | null }, actor: ApplicationActor) {
  if (actor.role !== "platform") throw new Error("FORBIDDEN");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const current = await database.prepare("SELECT id, status FROM platform_domain_requests WHERE id = ?1 AND application_id = ?2").bind(requestId, applicationId).first<{ id: string; status: string }>();
  if (!current) throw new Error("DOMAIN_REQUEST_NOT_FOUND");
  const status = ["pending", "reviewing", "active", "failed"].includes(String(input.status)) ? String(input.status) : current.status;
  const timestamp = now();
  await database.prepare("UPDATE platform_domain_requests SET status = ?1, note = ?2, updated_at = ?3 WHERE id = ?4 AND application_id = ?5")
    .bind(status, clean(input.note, 3000) || null, timestamp, requestId, applicationId).run();
  await recordApplicationEvent(database, applicationId, { eventType: "domain_status_changed", actor, note: input.note, payload: { requestId, status } });
  return listPlatformDomainRequests(applicationId);
}

export async function listPlatformApplicationAssets(applicationId: string): Promise<PlatformApplicationAsset[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, application_id AS applicationId, asset_key AS assetKey, kind, url, object_key AS objectKey,
      alt, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt, created_by AS createdBy
    FROM platform_application_assets WHERE application_id = ?1 ORDER BY created_at DESC LIMIT 200`).bind(applicationId).all<Record<string, unknown>>();
  return rows.results.map((row) => {
    const id = String(row.id);
    const applicationId = String(row.applicationId);
    let url = String(row.url);
    try {
      const parsed = new URL(url, "https://northline.invalid");
      parsed.searchParams.delete("token");
      url = `${parsed.pathname}${parsed.search}`;
    } catch {
      url = `/api/platform/applications/assets/${encodeURIComponent(id)}?applicationId=${encodeURIComponent(applicationId)}`;
    }
    return { id, applicationId, assetKey: String(row.assetKey), kind: String(row.kind), url, objectKey: row.objectKey ? String(row.objectKey) : null, alt: row.alt ? String(row.alt) : null, mimeType: String(row.mimeType), sizeBytes: Number(row.sizeBytes || 0), createdAt: String(row.createdAt), createdBy: String(row.createdBy) };
  });
}

export async function insertPlatformApplicationAsset(asset: PlatformApplicationAsset) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await database.prepare(`INSERT INTO platform_application_assets (id, application_id, asset_key, kind, url, object_key, alt, mime_type, size_bytes, created_at, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(asset.id, asset.applicationId, asset.assetKey, asset.kind, asset.url, asset.objectKey, asset.alt, asset.mimeType, asset.sizeBytes, asset.createdAt, asset.createdBy).run();
  return asset;
}

export async function updatePlatformApplicationAsset(applicationId: string, assetId: string, input: { assetKey?: string; kind?: string; alt?: string | null }, actor: ApplicationActor) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const assetKey = clean(input.assetKey, 120);
  const kind = clean(input.kind, 40) || "general";
  if (!assetKey) throw new Error("INVALID_ASSET_BINDING");
  const current = await database.prepare("SELECT id FROM platform_application_assets WHERE id = ?1 AND application_id = ?2").bind(assetId, applicationId).first<{ id: string }>();
  if (!current) throw new Error("ASSET_NOT_FOUND");
  await database.prepare(`UPDATE platform_application_assets SET asset_key = ?1, kind = ?2, alt = ?3 WHERE id = ?4 AND application_id = ?5`)
    .bind(assetKey, kind, clean(input.alt, 240) || null, assetId, applicationId).run();
  await recordApplicationEvent(database, applicationId, { eventType: "asset_binding_updated", actor, payload: { assetId, assetKey, kind } });
  return getPlatformApplicationAsset(assetId, applicationId);
}

export async function getPlatformApplicationAsset(id: string, applicationId: string) {
  const assets = await listPlatformApplicationAssets(applicationId);
  return assets.find((asset) => asset.id === id) || null;
}

export async function listPlatformSupportTickets(applicationId: string): Promise<PlatformSupportTicket[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, application_id AS applicationId, subject, message, status, created_by AS createdBy,
      created_by_email AS createdByEmail, assigned_to AS assignedTo, admin_note AS adminNote, created_at AS createdAt, updated_at AS updatedAt
    FROM platform_support_tickets WHERE application_id = ?1 ORDER BY updated_at DESC LIMIT 100`).bind(applicationId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ id: String(row.id), applicationId: String(row.applicationId), subject: String(row.subject), message: String(row.message), status: ["in_progress", "resolved"].includes(String(row.status)) ? String(row.status) as PlatformSupportTicket["status"] : "open", createdBy: String(row.createdBy), createdByEmail: String(row.createdByEmail), assignedTo: row.assignedTo ? String(row.assignedTo) : null, adminNote: row.adminNote ? String(row.adminNote) : null, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }));
}

export async function createPlatformSupportTicket(applicationId: string, input: { subject?: string; message?: string }, actor: ApplicationActor) {
  const subject = clean(input.subject, 160);
  const message = clean(input.message, 3000);
  if (!subject || !message) throw new Error("INVALID_TICKET");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const timestamp = now();
  await database.prepare(`INSERT INTO platform_support_tickets (id, application_id, subject, message, status, created_by, created_by_email, assigned_to, admin_note, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'open', ?5, ?6, NULL, NULL, ?7, ?7)`).bind(`ticket_${crypto.randomUUID()}`, applicationId, subject, message, actor.userId, actor.email, timestamp).run();
  await recordApplicationEvent(database, applicationId, { eventType: "support_ticket_created", actor, payload: { subject } });
  return listPlatformSupportTickets(applicationId);
}

function notificationFromRow(row: Record<string, unknown>): PlatformApplicationNotification {
  const status = ["sent", "failed"].includes(String(row.status)) ? String(row.status) as PlatformApplicationNotification["status"] : "pending";
  return {
    id: String(row.id),
    applicationId: String(row.applicationId),
    dedupeKey: String(row.dedupeKey),
    eventType: String(row.eventType),
    recipient: String(row.recipient),
    subject: String(row.subject),
    status,
    attempts: Number(row.attempts || 0),
    lastError: row.lastError ? String(row.lastError) : null,
    sentAt: row.sentAt ? String(row.sentAt) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export async function createPlatformApplicationNotification(input: {
  applicationId: string;
  dedupeKey: string;
  eventType: string;
  recipient: string;
  subject: string;
}) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const existing = await database.prepare(`SELECT id, application_id AS applicationId, dedupe_key AS dedupeKey,
      event_type AS eventType, recipient, subject, status, attempts, last_error AS lastError, sent_at AS sentAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM platform_application_notifications WHERE dedupe_key = ?1 LIMIT 1`).bind(input.dedupeKey).first<Record<string, unknown>>();
  if (existing) return notificationFromRow(existing);
  const timestamp = now();
  const id = `platform_notification_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO platform_application_notifications
      (id, application_id, dedupe_key, event_type, recipient, subject, status, attempts, last_error, sent_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', 0, NULL, NULL, ?7, ?7)`).bind(
    id,
    input.applicationId,
    clean(input.dedupeKey, 240),
    clean(input.eventType, 80),
    normalizeEmail(input.recipient),
    clean(input.subject, 200),
    timestamp,
  ).run();
  return {
    id,
    applicationId: input.applicationId,
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    recipient: input.recipient,
    subject: input.subject,
    status: "pending" as const,
    attempts: 0,
    lastError: null,
    sentAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updatePlatformApplicationNotification(id: string, input: { status: "pending" | "sent" | "failed"; attempts?: number; lastError?: string | null; sentAt?: string | null }) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const timestamp = now();
  await database.prepare(`UPDATE platform_application_notifications
    SET status = ?1, attempts = ?2, last_error = ?3, sent_at = ?4, updated_at = ?5 WHERE id = ?6`)
    .bind(input.status, input.attempts ?? 0, clean(input.lastError, 500) || null, input.sentAt || null, timestamp, id).run();
  const row = await database.prepare(`SELECT id, application_id AS applicationId, dedupe_key AS dedupeKey,
      event_type AS eventType, recipient, subject, status, attempts, last_error AS lastError, sent_at AS sentAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM platform_application_notifications WHERE id = ?1`).bind(id).first<Record<string, unknown>>();
  return row ? notificationFromRow(row) : null;
}

export async function listPlatformApplicationNotifications(applicationId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, application_id AS applicationId, dedupe_key AS dedupeKey,
      event_type AS eventType, recipient, subject, status, attempts, last_error AS lastError, sent_at AS sentAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM platform_application_notifications WHERE application_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(applicationId).all<Record<string, unknown>>();
  return rows.results.map(notificationFromRow);
}

export async function getPlatformApplicationNotification(id: string, applicationId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT id, application_id AS applicationId, dedupe_key AS dedupeKey,
      event_type AS eventType, recipient, subject, status, attempts, last_error AS lastError, sent_at AS sentAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM platform_application_notifications WHERE id = ?1 AND application_id = ?2 LIMIT 1`).bind(id, applicationId).first<Record<string, unknown>>();
  return row ? notificationFromRow(row) : null;
}

export async function applyPlatformApplicationToSite(applicationId: string, siteId: string, userId: string, email: string) {
  const application = await getPlatformApplication(applicationId);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  const uploadedAssets = await listPlatformApplicationAssets(applicationId);
  const bindings = { ...(application.productImport?.assetBindings || {}) };
  let heroUrl: string | null = null;
  if (uploadedAssets.length) {
    const bucket = getMediaBucket();
    for (const asset of uploadedAssets) {
      if (!asset.objectKey) {
        bindings[asset.url] = asset.url;
        continue;
      }
      const object = await bucket.get(asset.objectKey) as { arrayBuffer?: () => Promise<ArrayBuffer> } | null;
      if (!object?.arrayBuffer) throw new Error("MEDIA_COPY_FAILED");
      const targetAssetId = `asset_${crypto.randomUUID()}`;
      const safeName = asset.assetKey.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80) || "image";
      const targetObjectKey = `sites/${siteId}/assets/${targetAssetId}-${safeName}`;
      await bucket.put(targetObjectKey, await object.arrayBuffer(), { httpMetadata: { contentType: asset.mimeType, cacheControl: "public, max-age=31536000, immutable" } });
      const targetUrl = `/api/cms/assets/${targetAssetId}?siteId=${encodeURIComponent(siteId)}`;
      await insertAsset({ id: targetAssetId, siteId, assetKey: safeName, kind: asset.kind, url: targetUrl, objectKey: targetObjectKey, alt: asset.alt || "", mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, createdAt: now(), createdBy: userId });
      bindings[asset.url] = targetUrl;
      bindings[asset.assetKey] = targetUrl;
      if (!heroUrl && asset.kind === "hero") heroUrl = targetUrl;
    }
  }
  const config: Record<string, unknown> = {
    brand: { name: application.brandName, mark: application.brandName.slice(0, 1).toUpperCase() },
    content: { home: application.homeCopy ? { heroBody: application.homeCopy } : {} },
  };
  if (application.brandPrimaryColor) config.theme = { colors: { ink: application.brandPrimaryColor } };
  if (heroUrl) config.assets = { hero: heroUrl };
  const imported = application.productImport || {};
  await importClientData(siteId, { config, products: imported.products, productCsv: imported.productCsv, assetBindings: bindings }, userId, email);
  const database = getCmsDatabase();
  await recordApplicationEvent(database, applicationId, { eventType: "onboarding_applied", toStatus: "site_created", actor: { userId, email, role: "platform" }, payload: { siteId, uploadedAssets: uploadedAssets.length } });
  return { siteId, uploadedAssets: uploadedAssets.length };
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
    const couponEnabled = status === "scheduled" || status === "active" ? 1 : 0;
    if (schedule.targetType === "coupon") await database.prepare("UPDATE cms_coupons SET starts_at = ?1, ends_at = ?2, active = ?3, updated_at = ?4 WHERE site_id = ?5 AND id = ?6").bind(schedule.startsAt, schedule.endsAt, couponEnabled, timestamp, siteId, schedule.targetId).run();
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

export async function syncMerchantCampaignSchedules(siteId: string) {
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
