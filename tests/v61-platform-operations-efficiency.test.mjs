import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("V61 P1 stores one operational task per business source with assignment and SLA indexes", async () => {
  const migration = await source("../drizzle/0025_v61_p1_platform_operations.sql");
  assert.match(migration, /UNIQUE\(source_type, source_id\)/);
  assert.match(migration, /platform_work_items_assignee_idx/);
  assert.match(migration, /platform_saved_work_views/);
  assert.match(migration, /platform_work_reminders/);
});

test("V61 P1 derives the queue from canonical business records and closes tasks automatically", async () => {
  const operations = await source("../db/v61-operations.ts");
  for (const sourceName of ["platform_applications", "platform_support_tickets", "platform_billing_invoices", "platform_delivery_jobs", "platform_billing_webhook_events", "platform_application_notifications", "platform_domain_requests"]) {
    assert.match(operations, new RegExp(sourceName));
  }
  assert.match(operations, /status = 'resolved'/);
  assert.match(operations, /status = CASE WHEN platform_work_items.status = 'resolved' THEN 'open'/);
  assert.doesNotMatch(operations, /\["open", "in_progress", "waiting", "resolved"\]\.includes/);
});

test("V61 P1 protects task operations by capability, rate limit and audit trail", async () => {
  const operations = await source("../db/v61-operations.ts");
  const route = await source("../app/api/platform/work-items/route.ts");
  assert.match(operations, /billing\.manage/);
  assert.match(operations, /domains\.manage/);
  assert.match(operations, /support\.manage/);
  assert.match(route, /enforcePlatformRateLimit/);
  assert.match(route, /recordPlatformSecurityEvent/);
  assert.equal((route.match(/bulkUpdatePlatformWorkItems\(/g) || []).length, 1, "each bulk request must execute once");
});

test("V61 P1 provides operational views, CSV export, batch actions and canonical deep links", async () => {
  const panel = await source("../app/admin/v61-operations-panel.tsx");
  const route = await source("../app/api/platform/work-items/route.ts");
  const admin = await source("../app/admin/admin-v6.tsx");
  assert.match(admin, /id: "tasks", label: "运营待办"/);
  assert.match(panel, /保存视图/);
  assert.match(panel, /分配给我/);
  assert.match(panel, /24 小时后提醒/);
  assert.match(panel, /导出当前列表/);
  assert.match(panel, /href=\{item\.canonicalUrl\}/);
  assert.match(route, /format.*csv/);
});

test("V61 P1 refreshes the operations queue in the production worker", async () => {
  const worker = await source("../worker/index.ts");
  assert.match(worker, /syncPlatformWorkQueue/);
  assert.match(worker, /await syncPlatformWorkQueue\(\)/);
});
