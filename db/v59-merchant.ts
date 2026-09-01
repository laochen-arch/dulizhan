import { ensureCmsSchema, getCmsDatabase } from "./cms";
import { expirePendingOrders } from "./commerce";
import type { CustomerAddress } from "./v25";

export type MerchantCustomer = {
  email: string;
  userId: string | null;
  displayName: string;
  phone: string | null;
  registered: boolean;
  orderCount: number;
  paidOrderCount: number;
  totalSpent: number;
  currency: string;
  lastOrderAt: string | null;
  addressCount: number;
};

export type MerchantTask = {
  id: string;
  label: string;
  detail: string;
  count: number;
  severity: "urgent" | "warning" | "info";
  section: "orders" | "inventory" | "after-sales" | "operations" | "integrations";
};

type CustomerRow = {
  email: string;
  userId: string | null;
  displayName: string | null;
  phone: string | null;
  registered: number;
  orderCount: number;
  paidOrderCount: number;
  totalSpent: number;
  currency: string | null;
  lastOrderAt: string | null;
  addressCount: number;
};

function customerFromRow(row: CustomerRow): MerchantCustomer {
  return {
    email: row.email,
    userId: row.userId,
    displayName: row.displayName?.trim() || row.email,
    phone: row.phone,
    registered: Boolean(row.registered),
    orderCount: Number(row.orderCount || 0),
    paidOrderCount: Number(row.paidOrderCount || 0),
    totalSpent: Number(row.totalSpent || 0),
    currency: row.currency || "usd",
    lastOrderAt: row.lastOrderAt,
    addressCount: Number(row.addressCount || 0),
  };
}

export async function listMerchantCustomers(siteId: string): Promise<MerchantCustomer[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`WITH order_customers AS (
      SELECT lower(email) AS email_key, MAX(email) AS email, MAX(customer_user_id) AS user_id,
        MAX(customer_name) AS display_name, COUNT(*) AS order_count,
        SUM(CASE WHEN payment_status IN ('paid','partially_refunded','refunded') THEN 1 ELSE 0 END) AS paid_order_count,
        SUM(CASE WHEN payment_status IN ('paid','partially_refunded','refunded') THEN total - refund_total ELSE 0 END) AS total_spent,
        MAX(currency) AS currency, MAX(created_at) AS last_order_at
      FROM cms_orders WHERE site_id = ?1 GROUP BY lower(email)
    ), customer_profiles AS (
      SELECT lower(email) AS email_key, MAX(email) AS email, MAX(user_id) AS user_id,
        MAX(display_name) AS display_name, MAX(phone) AS phone, MAX(created_at) AS created_at
      FROM store_customers WHERE site_id = ?1 GROUP BY lower(email)
    ), customer_keys AS (
      SELECT email_key FROM order_customers UNION SELECT email_key FROM customer_profiles
    )
    SELECT COALESCE(p.email, o.email) AS email, COALESCE(p.user_id, o.user_id) AS userId,
      COALESCE(p.display_name, o.display_name) AS displayName, p.phone,
      CASE WHEN p.user_id IS NULL THEN 0 ELSE 1 END AS registered,
      COALESCE(o.order_count, 0) AS orderCount, COALESCE(o.paid_order_count, 0) AS paidOrderCount,
      COALESCE(o.total_spent, 0) AS totalSpent, COALESCE(o.currency, 'usd') AS currency,
      o.last_order_at AS lastOrderAt,
      COALESCE((SELECT COUNT(*) FROM customer_addresses a WHERE a.site_id = ?1 AND a.user_id = p.user_id), 0) AS addressCount
    FROM customer_keys k LEFT JOIN order_customers o ON o.email_key = k.email_key
      LEFT JOIN customer_profiles p ON p.email_key = k.email_key
    ORDER BY COALESCE(o.last_order_at, '') DESC, COALESCE(p.created_at, '') DESC`).bind(siteId).all<CustomerRow>();
  return rows.results.map(customerFromRow);
}

export async function getMerchantCustomer(siteId: string, emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("CUSTOMER_NOT_FOUND");
  const customer = (await listMerchantCustomers(siteId)).find((item) => item.email.toLowerCase() === email);
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  const database = getCmsDatabase();
  const orders = await database.prepare(`SELECT id, order_number AS orderNumber, total, currency, payment_status AS paymentStatus,
      fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, created_at AS createdAt
    FROM cms_orders WHERE site_id = ?1 AND lower(email) = ?2 ORDER BY created_at DESC LIMIT 100`).bind(siteId, email).all<{
      id: string; orderNumber: string; total: number; currency: string; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string;
    }>();
  let addresses: CustomerAddress[] = [];
  if (customer.userId) {
    const rows = await database.prepare(`SELECT id, site_id AS siteId, user_id AS userId, label, first_name AS firstName,
        last_name AS lastName, address, city, region, zip, country, phone, is_default AS isDefault,
        created_at AS createdAt, updated_at AS updatedAt
      FROM customer_addresses WHERE site_id = ?1 AND user_id = ?2 ORDER BY is_default DESC, updated_at DESC`).bind(siteId, customer.userId).all<Omit<CustomerAddress, "isDefault"> & { isDefault: number }>();
    addresses = rows.results.map((row) => ({ ...row, isDefault: Boolean(row.isDefault) }));
  }
  return { customer, orders: orders.results, addresses };
}

async function count(database: ReturnType<typeof getCmsDatabase>, sql: string, siteId: string) {
  const row = await database.prepare(sql).bind(siteId).first<{ count: number }>();
  return Number(row?.count || 0);
}

export async function getMerchantOperationalTasks(siteId: string): Promise<MerchantTask[]> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await expirePendingOrders(siteId);
  const [fulfillment, lowStock, afterSales, notificationFailures, webhookFailures, refundProblems, abandoned] = await Promise.all([
    count(database, "SELECT COUNT(*) AS count FROM cms_orders WHERE site_id = ?1 AND payment_status IN ('paid','partially_refunded') AND fulfillment_status IN ('unfulfilled','processing')", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_inventory WHERE site_id = ?1 AND quantity - reserved_quantity <= 5", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_after_sales_requests WHERE site_id = ?1 AND status NOT IN ('rejected','completed')", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_order_notifications WHERE site_id = ?1 AND status = 'failed'", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_payment_events WHERE site_id = ?1 AND processed_at IS NULL AND last_error IS NOT NULL", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_refunds WHERE site_id = ?1 AND status IN ('pending','processing','failed')", siteId),
    count(database, "SELECT COUNT(*) AS count FROM cms_abandoned_checkouts WHERE site_id = ?1 AND status IN ('open','failed')", siteId),
  ]);
  return [
    { id: "orders.fulfillment", label: "待配货与发货", detail: "已付款订单尚未完成发货，请核对库存并填写物流单号。", count: fulfillment, severity: "urgent", section: "orders" },
    { id: "refunds.pending", label: "退款结果待确认", detail: "退款正在处理或失败，请打开订单核对 PayPal 回执。", count: refundProblems, severity: "urgent", section: "orders" },
    { id: "after-sales.open", label: "售后申请待处理", detail: "客户退货、换货或退款申请尚未结案。", count: afterSales, severity: "warning", section: "after-sales" },
    { id: "inventory.low", label: "库存不足", detail: "可售库存不高于 5 件，需要补货或调整商品销售状态。", count: lowStock, severity: "warning", section: "inventory" },
    { id: "notifications.failed", label: "客户邮件发送失败", detail: "订单通知需要检查 Resend 配置或等待重试。", count: notificationFailures, severity: "urgent", section: "integrations" },
    { id: "webhooks.failed", label: "支付通知处理失败", detail: "PayPal Webhook 尚未成功处理，需要检查并重试。", count: webhookFailures, severity: "urgent", section: "integrations" },
    { id: "checkout.abandoned", label: "未完成结账", detail: "顾客已进入结账但尚未付款，可用于后续召回。", count: abandoned, severity: "info", section: "operations" },
  ].filter((task) => task.count > 0) as MerchantTask[];
}
