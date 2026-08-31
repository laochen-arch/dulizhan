import {
  ensureCmsSchema,
  findMember,
  getCmsDatabase,
  getSiteById,
  readSnapshot,
  type CmsRole,
  type D1DatabaseLike,
} from "./cms";
import { readOrder, type CmsOrderDetail } from "./commerce";

export type MerchantRole = "merchant_owner" | "merchant_manager" | "merchant_staff";

export type MerchantMember = {
  siteId: string;
  userId: string;
  email: string;
  role: MerchantRole;
  source: "invited" | "cms-owner-bridge" | "system";
  createdAt: string;
  updatedAt: string;
};

export type CustomerProfile = {
  siteId: string;
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddress = {
  id: string;
  siteId: string;
  userId: string;
  label: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StorefrontAccess = {
  authenticated: boolean;
  user: { id: string; email: string; displayName: string } | null;
  site: { id: string; slug: string; name: string };
  customerRole: "customer" | null;
  merchantRole: MerchantRole | null;
  cmsRole: CmsRole | null;
  capabilities: string[];
};

export type AccountOrderSummary = {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  currency: string;
  total: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  refundedAt: string | null;
  refundTotal: number;
};

export type AccountOrderDetail = {
  order: CmsOrderDetail["order"];
  items: CmsOrderDetail["items"];
  refunds: CmsOrderDetail["refunds"];
  stateEvents: CmsOrderDetail["stateEvents"];
};

export const merchantRoleCapabilities: Record<MerchantRole, string[]> = {
  merchant_owner: [
    "orders.refund",
    "merchant.read",
    "merchant.settings.read",
    "merchant.settings.write",
    "merchant.storefront.write",
    "merchant.team.manage",
    "products.read",
    "products.write",
    "marketing.read",
    "marketing.write",
    "inventory.read",
    "inventory.write",
    "orders.read",
    "orders.write",
    "fulfillment.write",
    "after-sales.read",
    "after-sales.write",
  ],
  merchant_manager: [
    "orders.refund",
    "merchant.read",
    "merchant.storefront.write",
    "products.read",
    "products.write",
    "marketing.read",
    "marketing.write",
    "inventory.read",
    "inventory.write",
    "orders.read",
    "orders.write",
    "fulfillment.write",
    "after-sales.read",
    "after-sales.write",
  ],
  merchant_staff: [
    "merchant.read",
    "inventory.read",
    "orders.read",
    "orders.write",
    "fulfillment.write",
    "after-sales.read",
    "after-sales.write",
  ],
};

const cmsCapabilities: Record<CmsRole, string[]> = {
  owner: ["cms.read", "cms.write", "cms.publish", "cms.members.manage", "cms.integrations.manage"],
  editor: ["cms.read", "cms.write"],
  viewer: ["cms.read"],
};

function now() {
  return new Date().toISOString();
}

function merchantRole(value: string | null | undefined): MerchantRole | null {
  return value === "merchant_owner" || value === "merchant_manager" || value === "merchant_staff" ? value : null;
}

function sourceValue(value: string | null | undefined): MerchantMember["source"] {
  return value === "cms-owner-bridge" || value === "system" ? value : "invited";
}

function memberFromRow(row: {
  siteId: string;
  userId: string;
  email: string;
  role: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}): MerchantMember | null {
  const role = merchantRole(row.role);
  if (!role) return null;
  return { ...row, role, source: sourceValue(row.source) };
}

function customerFromRow(row: {
  siteId: string;
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}): CustomerProfile {
  return row;
}

function addressFromRow(row: {
  id: string;
  siteId: string;
  userId: string;
  label: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  phone: string | null;
  isDefault: number;
  createdAt: string;
  updatedAt: string;
}): CustomerAddress {
  return { ...row, isDefault: Boolean(row.isDefault) };
}

export async function ensureV25Schema(database: D1DatabaseLike = getCmsDatabase()) {
  // V25 keeps this idempotent so an existing Sites database can roll forward
  // without a destructive migration or a manual tenant-by-tenant operation.
  await ensureCmsSchema(database);
}

export async function findMerchantMember(siteId: string, userId: string, email: string): Promise<MerchantMember | null> {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const row = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, source,
      created_at AS createdAt, updated_at AS updatedAt
    FROM merchant_members
    WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<{
      siteId: string;
      userId: string;
      email: string;
      role: string;
      source: string;
      createdAt: string;
      updatedAt: string;
    }>();
  return row ? memberFromRow(row) : null;
}

async function bridgeCmsOwnerToMerchant(siteId: string, userId: string, email: string): Promise<MerchantMember | null> {
  const cmsMember = await findMember(siteId, userId, email);
  if (!cmsMember || cmsMember.role !== "owner") return null;
  const database = getCmsDatabase();
  const timestamp = now();
  await database.prepare(`INSERT INTO merchant_members (site_id, user_id, email, role, source, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'merchant_owner', 'cms-owner-bridge', ?4, ?4)
    ON CONFLICT(site_id, user_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`).bind(siteId, userId, email, timestamp).run();
  return findMerchantMember(siteId, userId, email);
}

export async function getMerchantMembership(siteId: string, userId: string, email: string): Promise<MerchantMember | null> {
  const existing = await findMerchantMember(siteId, userId, email);
  return existing || bridgeCmsOwnerToMerchant(siteId, userId, email);
}

export async function listMerchantSites(userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  // Existing platform owners are also valid merchant owners for the default
  // demo tenant. Materialize that bridge once so the unified workspace has a
  // stable site list without bootstrapping access for unrelated accounts.
  const ownerRows = await database.prepare(`SELECT s.id AS siteId, s.slug, s.name, s.status, s.domain,
      s.created_at AS createdAt, s.updated_at AS updatedAt, m.email AS ownerEmail
    FROM cms_sites s INNER JOIN cms_members m ON m.site_id = s.id
    WHERE m.user_id = ?1 OR lower(m.email) = lower(?2)`).bind(userId, email).all<{ siteId: string; slug: string; name: string; status: string; domain: string | null; createdAt: string; updatedAt: string; ownerEmail: string }>();
  for (const row of ownerRows.results) {
    await database.prepare(`INSERT INTO merchant_members (site_id, user_id, email, role, source, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'merchant_owner', 'cms-owner-bridge', ?4, ?4)
      ON CONFLICT(site_id, user_id) DO NOTHING`).bind(row.siteId, userId, email.trim().toLowerCase(), row.createdAt).run();
  }
  const rows = await database.prepare(`SELECT s.id, s.slug, s.name, s.status, s.domain,
      s.created_at AS createdAt, s.updated_at AS updatedAt, m.role
    FROM cms_sites s INNER JOIN merchant_members m ON m.site_id = s.id
    WHERE m.user_id = ?1 OR lower(m.email) = lower(?2)
    ORDER BY s.created_at ASC`).bind(userId, email).all<{ id: string; slug: string; name: string; status: string; domain: string | null; createdAt: string; updatedAt: string; role: string }>();
  return rows.results.map((row) => ({ id: row.id, slug: row.slug, name: row.name, status: row.status, domain: row.domain, createdAt: row.createdAt, updatedAt: row.updatedAt, role: merchantRole(row.role) || "merchant_staff" as MerchantRole }));
}

export async function upsertMerchantMember(siteId: string, member: { userId: string; email: string; role: MerchantRole }, source: MerchantMember["source"] = "invited") {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  await getSiteById(siteId);
  const timestamp = now();
  await database.prepare(`INSERT INTO merchant_members (site_id, user_id, email, role, source, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
    ON CONFLICT(site_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role, source = excluded.source, updated_at = excluded.updated_at`)
    .bind(siteId, member.userId, member.email.trim().toLowerCase(), member.role, source, timestamp).run();
  return findMerchantMember(siteId, member.userId, member.email);
}

export async function listMerchantMembers(siteId: string) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const rows = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, source,
      created_at AS createdAt, updated_at AS updatedAt FROM merchant_members WHERE site_id = ?1 ORDER BY created_at ASC`).bind(siteId).all<{ siteId: string; userId: string; email: string; role: string; source: string; createdAt: string; updatedAt: string }>();
  return rows.results.map(memberFromRow).filter(Boolean) as MerchantMember[];
}

export async function removeMerchantMember(siteId: string, userId: string) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const current = await database.prepare("SELECT role FROM merchant_members WHERE site_id = ?1 AND user_id = ?2").bind(siteId, userId).first<{ role: string }>();
  if (!current) throw new Error("MEMBER_NOT_FOUND");
  if (current.role === "merchant_owner") {
    const owners = await database.prepare("SELECT COUNT(*) AS count FROM merchant_members WHERE site_id = ?1 AND role = 'merchant_owner'").bind(siteId).first<{ count: number }>();
    if (Number(owners?.count || 0) <= 1) throw new Error("LAST_OWNER");
  }
  await database.prepare("DELETE FROM merchant_members WHERE site_id = ?1 AND user_id = ?2").bind(siteId, userId).run();
  return listMerchantMembers(siteId);
}

export async function ensureStoreCustomer(siteId: string, user: { userId: string; email: string; displayName: string }): Promise<CustomerProfile> {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  await getSiteById(siteId);
  const timestamp = now();
  const displayName = user.displayName.trim().slice(0, 160) || user.email;
  await database.prepare(`INSERT INTO store_customers (site_id, user_id, email, display_name, phone, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)
    ON CONFLICT(site_id, user_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`)
    .bind(siteId, user.userId, user.email.trim().toLowerCase(), displayName, timestamp).run();
  const row = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, display_name AS displayName,
      phone, created_at AS createdAt, updated_at AS updatedAt
    FROM store_customers WHERE site_id = ?1 AND user_id = ?2 LIMIT 1`).bind(siteId, user.userId).first<{
      siteId: string;
      userId: string;
      email: string;
      displayName: string;
      phone: string | null;
      createdAt: string;
      updatedAt: string;
    }>();
  if (!row) throw new Error("CUSTOMER_NOT_FOUND");
  return customerFromRow(row);
}

export async function getStorefrontAccess(siteId: string, user?: { userId: string; email: string; displayName: string }): Promise<StorefrontAccess> {
  const site = await getSiteById(siteId);
  if (!user) {
    return { authenticated: false, user: null, site: { id: site.id, slug: site.slug, name: site.name }, customerRole: null, merchantRole: null, cmsRole: null, capabilities: [] };
  }
  const cmsMember = await findMember(siteId, user.userId, user.email);
  const merchantMember = await getMerchantMembership(siteId, user.userId, user.email);
  await ensureStoreCustomer(siteId, user);
  const capabilities = new Set<string>();
  if (cmsMember) cmsCapabilities[cmsMember.role].forEach((capability) => capabilities.add(capability));
  if (merchantMember) merchantRoleCapabilities[merchantMember.role].forEach((capability) => capabilities.add(capability));
  capabilities.add("account.read");
  capabilities.add("orders.own.read");
  capabilities.add("addresses.manage");
  return {
    authenticated: true,
    user: { id: user.userId, email: user.email, displayName: user.displayName },
    site: { id: site.id, slug: site.slug, name: site.name },
    customerRole: "customer",
    merchantRole: merchantMember?.role ?? null,
    cmsRole: cmsMember?.role ?? null,
    capabilities: Array.from(capabilities).sort(),
  };
}

export async function getCustomerProfile(siteId: string, user: { userId: string; email: string; displayName: string }) {
  return ensureStoreCustomer(siteId, user);
}

export async function updateCustomerProfile(siteId: string, user: { userId: string; email: string; displayName: string }, input: { displayName?: string; phone?: string }) {
  const current = await ensureStoreCustomer(siteId, user);
  const displayName = typeof input.displayName === "string" ? input.displayName.trim().slice(0, 160) : current.displayName;
  const phone = typeof input.phone === "string" ? input.phone.trim().slice(0, 40) || null : current.phone;
  if (!displayName) throw new Error("INVALID_PROFILE");
  const database = getCmsDatabase();
  await database.prepare("UPDATE store_customers SET display_name = ?1, phone = ?2, updated_at = ?3 WHERE site_id = ?4 AND user_id = ?5")
    .bind(displayName, phone, now(), siteId, user.userId).run();
  return getCustomerProfile(siteId, user);
}

export async function listCustomerAddresses(siteId: string, userId: string): Promise<CustomerAddress[]> {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, user_id AS userId, label, first_name AS firstName,
      last_name AS lastName, address, city, region, zip, country, phone, is_default AS isDefault,
      created_at AS createdAt, updated_at AS updatedAt
    FROM customer_addresses WHERE site_id = ?1 AND user_id = ?2 ORDER BY is_default DESC, updated_at DESC`).bind(siteId, userId).all<{
      id: string;
      siteId: string;
      userId: string;
      label: string;
      firstName: string;
      lastName: string;
      address: string;
      city: string;
      region: string;
      zip: string;
      country: string;
      phone: string | null;
      isDefault: number;
      createdAt: string;
      updatedAt: string;
    }>();
  return rows.results.map(addressFromRow);
}

type AddressInput = Partial<Pick<CustomerAddress, "label" | "firstName" | "lastName" | "address" | "city" | "region" | "zip" | "country" | "phone" | "isDefault">>;

function cleanAddress(input: AddressInput) {
  const value = (key: keyof AddressInput, max: number, fallback = "") => typeof input[key] === "string" ? String(input[key]).trim().slice(0, max) : fallback;
  const address = {
    label: value("label", 80, "Shipping address"),
    firstName: value("firstName", 80),
    lastName: value("lastName", 80),
    address: value("address", 240),
    city: value("city", 100),
    region: value("region", 100),
    zip: value("zip", 30),
    country: value("country", 80),
    phone: value("phone", 40) || null,
    isDefault: Boolean(input.isDefault),
  };
  if ([address.firstName, address.lastName, address.address, address.city, address.region, address.zip, address.country].some((item) => !item)) throw new Error("INVALID_ADDRESS");
  return address;
}

export async function createCustomerAddress(siteId: string, userId: string, input: AddressInput) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const address = cleanAddress(input);
  const existing = await database.prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE site_id = ?1 AND user_id = ?2").bind(siteId, userId).first<{ count: number }>();
  const shouldDefault = address.isDefault || Number(existing?.count || 0) === 0;
  const timestamp = now();
  const id = `address_${crypto.randomUUID()}`;
  const statements = [] as Array<ReturnType<D1DatabaseLike["prepare"]>>;
  if (shouldDefault) statements.push(database.prepare("UPDATE customer_addresses SET is_default = 0, updated_at = ?1 WHERE site_id = ?2 AND user_id = ?3").bind(timestamp, siteId, userId));
  statements.push(database.prepare(`INSERT INTO customer_addresses (id, site_id, user_id, label, first_name, last_name, address, city, region, zip, country, phone, is_default, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`).bind(id, siteId, userId, address.label, address.firstName, address.lastName, address.address, address.city, address.region, address.zip, address.country, address.phone, shouldDefault ? 1 : 0, timestamp));
  await database.batch(statements);
  return (await listCustomerAddresses(siteId, userId)).find((item) => item.id === id) || null;
}

export async function updateCustomerAddress(siteId: string, userId: string, addressId: string, input: AddressInput) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const current = await database.prepare(`SELECT id, site_id AS siteId, user_id AS userId, label, first_name AS firstName,
      last_name AS lastName, address, city, region, zip, country, phone, is_default AS isDefault,
      created_at AS createdAt, updated_at AS updatedAt FROM customer_addresses
    WHERE id = ?1 AND site_id = ?2 AND user_id = ?3`).bind(addressId, siteId, userId).first<{
      id: string;
      siteId: string;
      userId: string;
      label: string;
      firstName: string;
      lastName: string;
      address: string;
      city: string;
      region: string;
      zip: string;
      country: string;
      phone: string | null;
      isDefault: number;
      createdAt: string;
      updatedAt: string;
    }>();
  if (!current) throw new Error("ADDRESS_NOT_FOUND");
  const next = cleanAddress({ ...addressFromRow(current), ...input });
  const timestamp = now();
  const statements = [] as Array<ReturnType<D1DatabaseLike["prepare"]>>;
  if (next.isDefault) statements.push(database.prepare("UPDATE customer_addresses SET is_default = 0, updated_at = ?1 WHERE site_id = ?2 AND user_id = ?3").bind(timestamp, siteId, userId));
  statements.push(database.prepare(`UPDATE customer_addresses SET label = ?1, first_name = ?2, last_name = ?3, address = ?4,
      city = ?5, region = ?6, zip = ?7, country = ?8, phone = ?9, is_default = ?10, updated_at = ?11
    WHERE id = ?12 AND site_id = ?13 AND user_id = ?14`).bind(next.label, next.firstName, next.lastName, next.address, next.city, next.region, next.zip, next.country, next.phone, next.isDefault ? 1 : 0, timestamp, addressId, siteId, userId));
  await database.batch(statements);
  return (await listCustomerAddresses(siteId, userId)).find((item) => item.id === addressId) || null;
}

export async function deleteCustomerAddress(siteId: string, userId: string, addressId: string) {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const current = await database.prepare("SELECT is_default AS isDefault FROM customer_addresses WHERE id = ?1 AND site_id = ?2 AND user_id = ?3").bind(addressId, siteId, userId).first<{ isDefault: number }>();
  if (!current) throw new Error("ADDRESS_NOT_FOUND");
  await database.prepare("DELETE FROM customer_addresses WHERE id = ?1 AND site_id = ?2 AND user_id = ?3").bind(addressId, siteId, userId).run();
  if (current.isDefault) {
    const replacement = (await listCustomerAddresses(siteId, userId))[0];
    if (replacement) await database.prepare("UPDATE customer_addresses SET is_default = 1, updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND user_id = ?4").bind(now(), replacement.id, siteId, userId).run();
  }
  return { ok: true };
}

async function claimGuestOrders(database: D1DatabaseLike, siteId: string, userId: string, email: string) {
  if (!userId || !email.trim()) return;
  await database.prepare(`UPDATE cms_orders SET customer_user_id = ?1
    WHERE site_id = ?2 AND customer_user_id IS NULL AND lower(email) = lower(?3)`).bind(userId, siteId, email.trim()).run();
}

export async function listCustomerOrders(siteId: string, userId: string, email: string): Promise<AccountOrderSummary[]> {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  await claimGuestOrders(database, siteId, userId, email);
  const rows = await database.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, email, currency,
      total, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus,
      tracking_number AS trackingNumber, created_at AS createdAt, paid_at AS paidAt, shipped_at AS shippedAt,
      refunded_at AS refundedAt, refund_total AS refundTotal
    FROM cms_orders WHERE site_id = ?1 AND (customer_user_id = ?2 OR (customer_user_id IS NULL AND lower(email) = lower(?3))) ORDER BY created_at DESC LIMIT 100`).bind(siteId, userId, email.trim()).all<AccountOrderSummary>();
  return rows.results;
}

export async function getCustomerOrder(siteId: string, orderId: string, userId: string, email: string): Promise<AccountOrderDetail> {
  const database = getCmsDatabase();
  await ensureV25Schema(database);
  const owner = await database.prepare("SELECT id, customer_user_id AS customerUserId FROM cms_orders WHERE id = ?1 AND site_id = ?2 AND (customer_user_id = ?3 OR (customer_user_id IS NULL AND lower(email) = lower(?4)))").bind(orderId, siteId, userId, email.trim()).first<{ id: string; customerUserId: string | null }>();
  if (!owner) throw new Error("ORDER_NOT_FOUND");
  if (!owner.customerUserId) await database.prepare("UPDATE cms_orders SET customer_user_id = ?1 WHERE id = ?2 AND site_id = ?3 AND customer_user_id IS NULL").bind(userId, orderId, siteId).run();
  const detail = await readOrder(database, orderId, siteId);
  return {
    order: { ...detail.order, customerUserId: null, paypalOrderId: null, paypalApprovalUrl: null, paypalCaptureId: null, adminNote: null },
    items: detail.items,
    refunds: detail.refunds,
    stateEvents: detail.stateEvents,
  };
}

export async function getMerchantWorkspaceOverview(siteId: string, userId: string, email: string) {
  const member = await getMerchantMembership(siteId, userId, email);
  if (!member) throw new Error("MERCHANT_FORBIDDEN");
  const database = getCmsDatabase();
  const snapshot = await readSnapshot(siteId, "published");
  const orders = await database.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, email, currency,
      total, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber,
      created_at AS createdAt FROM cms_orders WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(siteId).all<{
        id: string;
        orderNumber: string;
        customerName: string;
        email: string;
        currency: string;
        total: number;
        paymentStatus: string;
        fulfillmentStatus: string;
        trackingNumber: string | null;
        createdAt: string;
      }>();
  const inventory = await database.prepare(`SELECT COUNT(DISTINCT product_id) AS products,
      SUM(CASE WHEN quantity - reserved_quantity <= 5 THEN 1 ELSE 0 END) AS lowStock,
      COALESCE(SUM(MAX(0, quantity - reserved_quantity)), 0) AS units
    FROM cms_inventory WHERE site_id = ?1`).bind(siteId).first<{ products: number; lowStock: number; units: number }>();
  return {
    site: { id: snapshot.site.id, slug: snapshot.site.slug, name: snapshot.site.name },
    role: member.role,
    capabilities: merchantRoleCapabilities[member.role],
    products: snapshot.catalog.filter((product) => product.status === "active").map((product) => ({ id: product.id, name: product.name, category: product.category, price: product.price, stock: product.stock, status: product.status })),
    orders: orders.results,
    inventory: { products: Number(inventory?.products || snapshot.catalog.length), lowStock: Number(inventory?.lowStock || 0), units: Number(inventory?.units || 0) },
  };
}

export function storefrontAccessErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "V25_ACCESS_ERROR";
  return message;
}
