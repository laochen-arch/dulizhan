import { getPlatformStaffAccess } from "../staff-access";
import { enforcePlatformRateLimit, recordPlatformSecurityEvent } from "../../../../db/v61";
import { bulkUpdatePlatformWorkItems, deletePlatformWorkView, dismissPlatformWorkReminder, getPlatformWorkQueueSnapshot, platformWorkItemsCsv, savePlatformWorkView, syncPlatformWorkQueue, updatePlatformWorkItem, type PlatformWorkActor, type PlatformWorkItem } from "../../../../db/v61-operations";

export const dynamic = "force-dynamic";

function responseError(code: string, status = 400) {
  const labels: Record<string, string> = {
    FORBIDDEN: "当前账号没有处理这类运营事项的权限。",
    RATE_LIMITED: "操作过于频繁，请稍后再试。",
    WORK_ITEM_NOT_FOUND: "待办事项不存在或已经关闭。",
    WORK_ITEM_CONFLICT: "该待办刚被其他同事更新，请刷新后重试。",
    INVALID_WORK_STATUS: "请选择有效的跟进状态。",
    INVALID_WORK_PRIORITY: "请选择有效的优先级。",
    INVALID_WORK_DATE: "日期格式不正确，或超出了允许范围。",
    ASSIGNEE_NOT_FOUND: "负责人不存在或已离开平台团队。",
    WORK_ITEMS_REQUIRED: "请至少选择一条待办事项。",
    INVALID_VIEW_NAME: "视图名称至少需要两个字符。",
    WORK_VIEW_NOT_FOUND: "保存的视图不存在。",
    REMINDER_NOT_FOUND: "提醒不存在、已关闭或无权处理。",
  };
  return Response.json({ success: false, error: { code, message: labels[code] || "运营操作失败，请重试。" } }, { status, headers: { "Cache-Control": "no-store" } });
}

function actorFor(staff: NonNullable<Awaited<ReturnType<typeof getPlatformStaffAccess>>>): PlatformWorkActor {
  return { userId: staff.user.userId, email: staff.user.email, capabilities: staff.capabilities };
}

function filtered(items: PlatformWorkItem[], params: URLSearchParams, actor: PlatformWorkActor) {
  const scope = params.get("scope") || "active";
  const category = params.get("category") || "";
  const status = params.get("status") || "";
  const priority = params.get("priority") || "";
  const sla = params.get("sla") || "";
  const assignee = params.get("assignee") || "";
  return items.filter((item) => {
    if (scope === "active" && item.status === "resolved") return false;
    if (scope === "mine" && (item.status === "resolved" || item.assignedToUserId !== actor.userId)) return false;
    if (scope === "unassigned" && (item.status === "resolved" || item.assignedToUserId)) return false;
    if (scope === "overdue" && (item.status === "resolved" || item.slaState !== "overdue")) return false;
    if (category && item.category !== category) return false;
    if (status && item.status !== status) return false;
    if (priority && item.priority !== priority) return false;
    if (sla && item.slaState !== sla) return false;
    if (assignee === "me" && item.assignedToUserId !== actor.userId) return false;
    if (assignee === "unassigned" && item.assignedToUserId) return false;
    if (assignee && !["me", "unassigned"].includes(assignee) && item.assignedToUserId !== assignee) return false;
    return true;
  });
}

export async function GET(request: Request) {
  try {
    const staff = await getPlatformStaffAccess();
    if (!staff || !staff.capabilities.includes("applications.read")) return responseError("FORBIDDEN", 403);
    const actor = actorFor(staff);
    const url = new URL(request.url);
    const snapshot = await getPlatformWorkQueueSnapshot(actor);
    if (url.searchParams.get("format") === "csv") {
      const csv = platformWorkItemsCsv(filtered(snapshot.items, url.searchParams, actor));
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="platform-work-items-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    }
    return Response.json({ success: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "WORK_QUEUE_FAILED", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getPlatformStaffAccess();
    if (!staff || !staff.capabilities.includes("applications.read")) return responseError("FORBIDDEN", 403);
    const actor = actorFor(staff);
    await enforcePlatformRateLimit("platform-work-items", `${actor.userId}:${request.headers.get("cf-connecting-ip") || "unknown"}`, 60, 60);
    const payload = await request.json().catch(() => ({})) as { action?: string; bulkAction?: string; id?: string; ids?: string[]; status?: string; priority?: string; assigneeUserId?: string | null; dueAt?: string | null; snoozedUntil?: string | null; expectedUpdatedAt?: string; hours?: number; name?: string; filters?: unknown };
    if (payload.action === "sync") return Response.json({ success: true, sync: await syncPlatformWorkQueue() });
    if (payload.action === "update") {
      if (!payload.id) throw new Error("WORK_ITEM_NOT_FOUND");
      await updatePlatformWorkItem(payload.id, payload, actor);
      return Response.json({ success: true, snapshot: await getPlatformWorkQueueSnapshot(actor) });
    }
    if (payload.action === "bulk") {
      const requestedAction = ["claim", "unassign", "snooze", "priority", "status"].includes(String(payload.bulkAction))
        ? payload.bulkAction as "claim" | "unassign" | "snooze" | "priority" | "status"
        : payload.status ? "status" : payload.priority ? "priority" : "claim";
      const outcome = await bulkUpdatePlatformWorkItems(payload.ids || [], { action: requestedAction, priority: payload.priority, status: payload.status, hours: payload.hours }, actor);
      await recordPlatformSecurityEvent({ actor: { userId: actor.userId, email: actor.email, role: "platform" }, action: "platform.work_items.bulk_update", targetType: "platform_work_items", riskLevel: "normal", requestId: request.headers.get("cf-ray"), ip: request.headers.get("cf-connecting-ip"), metadata: { requested: payload.ids?.length || 0, succeeded: outcome.succeeded.length, failed: outcome.failed.length, bulkAction: requestedAction } });
      return Response.json({ success: true, outcome, snapshot: await getPlatformWorkQueueSnapshot(actor) });
    }
    if (payload.action === "save_view") {
      await savePlatformWorkView(payload.name || "", payload.filters, actor);
      return Response.json({ success: true, snapshot: await getPlatformWorkQueueSnapshot(actor) });
    }
    if (payload.action === "delete_view") {
      if (!payload.id) throw new Error("WORK_VIEW_NOT_FOUND");
      await deletePlatformWorkView(payload.id, actor);
      return Response.json({ success: true, snapshot: await getPlatformWorkQueueSnapshot(actor) });
    }
    if (payload.action === "dismiss_reminder") {
      if (!payload.id) throw new Error("REMINDER_NOT_FOUND");
      await dismissPlatformWorkReminder(payload.id, actor);
      return Response.json({ success: true, snapshot: await getPlatformWorkQueueSnapshot(actor) });
    }
    return responseError("UNKNOWN_ACTION");
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORK_ITEM_UPDATE_FAILED";
    return responseError(code, code === "FORBIDDEN" ? 403 : code === "RATE_LIMITED" ? 429 : code === "WORK_ITEM_CONFLICT" ? 409 : code.includes("NOT_FOUND") ? 404 : 400);
  }
}
