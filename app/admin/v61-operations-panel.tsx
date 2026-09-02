"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type WorkItem = {
  id: string; category: string; title: string; description: string | null; sourceStatus: string;
  status: "open" | "in_progress" | "waiting" | "resolved"; priority: "urgent" | "high" | "normal" | "low";
  assignedToUserId: string | null; assignedToEmail: string | null; dueAt: string; snoozedUntil: string | null;
  updatedAt: string; brandName: string | null; companyName: string | null; applicantEmail: string | null;
  canonicalUrl: string; slaState: "overdue" | "due_soon" | "on_track" | "snoozed" | "resolved";
};
type Filters = { scope: string; category: string; status: string; priority: string; sla: string; assignee: string };
type Snapshot = {
  generatedAt: string;
  metrics: { open: number; mine: number; unassigned: number; overdue: number; dueSoon: number; urgent: number };
  items: WorkItem[];
  reminders: Array<{ id: string; workItemId: string; reminderType: string; status: string; generatedAt: string }>;
  savedViews: Array<{ id: string; name: string; filters: Partial<Filters>; updatedAt: string }>;
  staff: Array<{ userId: string; email: string; role: string }>;
  currentUserId: string;
};

const initialFilters: Filters = { scope: "active", category: "", status: "", priority: "", sla: "", assignee: "" };
const categoryNames: Record<string, string> = { application_review: "入驻审核", support: "商户工单", billing: "账单续费", delivery: "站点交付", webhook: "支付回调", email: "邮件通知", domain: "域名接入" };
const statusNames: Record<string, string> = { open: "待处理", in_progress: "处理中", waiting: "等待外部回复", resolved: "已由业务闭环" };
const priorityNames: Record<string, string> = { urgent: "紧急", high: "高", normal: "普通", low: "低" };
const slaNames: Record<string, string> = { overdue: "已超时", due_soon: "即将超时", on_track: "正常", snoozed: "已稍后提醒", resolved: "已闭环" };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : value;
}

export function V61OperationsPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [viewName, setViewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/work-items", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as Snapshot & { success?: boolean; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "运营待办加载失败。");
      setSnapshot(payload); setSelected([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "运营待办加载失败。"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = useCallback(async (body: Record<string, unknown>, successText: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/platform/work-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; snapshot?: Snapshot; error?: { message?: string }; outcome?: { succeeded: string[]; failed: unknown[] } };
      if (!response.ok) throw new Error(payload.error?.message || "操作失败，请重试。");
      if (payload.snapshot) setSnapshot(payload.snapshot); else await load();
      setSelected([]);
      const suffix = payload.outcome?.failed.length ? `，${payload.outcome.failed.length} 条因权限或数据变化未处理` : "";
      setNotice(`${successText}${suffix}。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  }, [load]);

  const items = useMemo(() => (snapshot?.items || []).filter((item) => {
    const keyword = query.trim().toLowerCase();
    if (keyword && ![item.title, item.brandName, item.companyName, item.applicantEmail, item.assignedToEmail].some((value) => value?.toLowerCase().includes(keyword))) return false;
    if (filters.scope === "active" && item.status === "resolved") return false;
    if (filters.scope === "mine" && (item.status === "resolved" || item.assignedToUserId !== snapshot?.currentUserId)) return false;
    if (filters.scope === "unassigned" && (item.status === "resolved" || item.assignedToUserId)) return false;
    if (filters.scope === "overdue" && (item.status === "resolved" || item.slaState !== "overdue")) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.sla && item.slaState !== filters.sla) return false;
    if (filters.assignee === "me" && item.assignedToUserId !== snapshot?.currentUserId) return false;
    if (filters.assignee === "unassigned" && item.assignedToUserId) return false;
    if (filters.assignee && !["me", "unassigned"].includes(filters.assignee) && item.assignedToUserId !== filters.assignee) return false;
    return true;
  }), [filters, query, snapshot]);

  const selectedVisible = selected.filter((id) => items.some((item) => item.id === id));
  const allSelected = items.length > 0 && selectedVisible.length === items.length;
  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const bulk = (bulkAction: string, extra: Record<string, unknown> = {}) => run({ action: "bulk", bulkAction, ids: selectedVisible, ...extra }, `已处理 ${selectedVisible.length} 条待办`);
  const applyView = (viewFilters: Partial<Filters>) => setFilters({ ...initialFilters, ...viewFilters });
  const exportCsv = () => {
    const params = new URLSearchParams({ format: "csv", ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
    window.location.href = `/api/platform/work-items?${params.toString()}`;
  };

  if (!snapshot && busy) return <section className="bo-card" aria-live="polite">正在汇总入驻、账单、交付和异常事项…</section>;

  return <div className="bo-workspace-queue">
    {error && <div className="bo-error" role="alert">{error} <button className="text-button" type="button" onClick={() => void load()}>重新加载</button></div>}
    {notice && <div className="bo-info" role="status">{notice}</div>}

    <div className="bo-metrics bo-work-metrics">
      {[["全部待办", snapshot?.metrics.open || 0, "active"], ["分配给我", snapshot?.metrics.mine || 0, "mine"], ["无人负责", snapshot?.metrics.unassigned || 0, "unassigned"], ["已经超时", snapshot?.metrics.overdue || 0, "overdue"]].map(([label, value, scope]) =>
        <button className={filters.scope === scope ? "bo-metric is-active" : "bo-metric"} type="button" key={String(scope)} onClick={() => setFilter("scope", String(scope))}><span>{label}</span><strong>{value}</strong></button>)}
    </div>

    {!!snapshot?.reminders.length && <section className="bo-card bo-work-reminders"><header className="bo-card-heading"><div><h2>需要马上关注</h2><p>系统根据处理时限自动生成，完成源业务后会自动关闭。</p></div><span>{snapshot.reminders.length} 项</span></header><div className="bo-work-reminder-list">{snapshot.reminders.slice(0, 5).map((reminder) => { const item = snapshot.items.find((entry) => entry.id === reminder.workItemId); return item ? <article key={reminder.id}><span className={`bo-status is-${reminder.reminderType}`}>{reminder.reminderType === "overdue" ? "已超时" : "即将超时"}</span><div><strong>{item.title}</strong><small>{item.brandName || item.companyName || "平台事项"} · 截止 {formatDate(item.dueAt)}</small></div><a className="text-button" href={item.canonicalUrl}>去处理 →</a><button className="text-button" type="button" disabled={busy} onClick={() => void run({ action: "dismiss_reminder", id: reminder.id }, "提醒已关闭")}>暂不提醒</button></article> : null; })}</div></section>}

    <section className="bo-card">
      <header className="bo-card-heading"><div><h2>运营待办</h2><p>任务从业务数据自动汇总；审核、续费、交付等最终结果仍在对应业务页面处理。</p></div><div className="bo-actions"><button className="button button-outline" type="button" disabled={busy} onClick={exportCsv}>导出当前列表</button><button className="button button-outline" type="button" disabled={busy} onClick={() => void load()}>{busy ? "正在刷新…" : "刷新"}</button></div></header>

      <div className="bo-work-scopes" aria-label="待办范围">{[["active", "全部待办"], ["mine", "我的待办"], ["unassigned", "待分配"], ["overdue", "已超时"], ["all", "含已闭环"]].map(([value, label]) => <button type="button" className={filters.scope === value ? "is-active" : ""} key={value} onClick={() => setFilter("scope", value)}>{label}</button>)}</div>
      <div className="bo-filters bo-work-filters">
        <label><span className="sr-only">搜索运营待办</span><input type="search" placeholder="搜索商户、标题或邮箱" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label><span className="sr-only">事项类型</span><select value={filters.category} onChange={(event) => setFilter("category", event.target.value)}><option value="">全部类型</option>{Object.entries(categoryNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">处理状态</span><select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">优先级</span><select value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)}><option value="">全部优先级</option>{Object.entries(priorityNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">负责人</span><select value={filters.assignee} onChange={(event) => setFilter("assignee", event.target.value)}><option value="">全部负责人</option><option value="me">只看我负责</option><option value="unassigned">尚未分配</option>{snapshot?.staff.map((member) => <option value={member.userId} key={member.userId}>{member.email}</option>)}</select></label>
      </div>

      <div className="bo-work-views"><div className="bo-actions"><input aria-label="视图名称" placeholder="给当前筛选命名" value={viewName} maxLength={60} onChange={(event) => setViewName(event.target.value)} /><button className="button button-outline" type="button" disabled={busy || viewName.trim().length < 2} onClick={() => void run({ action: "save_view", name: viewName, filters }, "筛选视图已保存").then(() => setViewName(""))}>保存视图</button></div><div className="bo-actions">{snapshot?.savedViews.map((view) => <span className="bo-saved-view" key={view.id}><button type="button" onClick={() => applyView(view.filters)}>{view.name}</button><button type="button" aria-label={`删除视图 ${view.name}`} disabled={busy} onClick={() => void run({ action: "delete_view", id: view.id }, "筛选视图已删除")}>×</button></span>)}</div></div>

      {!!selectedVisible.length && <div className="bo-work-bulk" role="region" aria-label="批量操作"><strong>已选 {selectedVisible.length} 条</strong><button type="button" disabled={busy} onClick={() => void bulk("claim")}>分配给我</button><button type="button" disabled={busy} onClick={() => void bulk("unassign")}>取消分配</button><button type="button" disabled={busy} onClick={() => void bulk("snooze", { hours: 24 })}>24 小时后提醒</button><select aria-label="批量设置优先级" defaultValue="" disabled={busy} onChange={(event) => { if (event.target.value) void bulk("priority", { priority: event.target.value }); event.target.value = ""; }}><option value="" disabled>设置优先级</option>{Object.entries(priorityNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>}

      <div className="bo-table-scroll"><table><thead><tr><th scope="col"><input type="checkbox" aria-label="选择当前列表全部待办" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((item) => item.id))} /></th><th scope="col">待办事项</th><th scope="col">所属商户</th><th scope="col">状态</th><th scope="col">优先级</th><th scope="col">负责人</th><th scope="col">处理时限</th><th scope="col">操作</th></tr></thead><tbody>{items.slice(0, 100).map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`选择 ${item.title}`} checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /></td><td><strong>{item.title}</strong><small>{categoryNames[item.category] || item.category} · 来源状态：{item.sourceStatus}</small></td><td>{item.brandName || item.companyName || "平台事项"}<small>{item.applicantEmail || "—"}</small></td><td><span className={`bo-status is-${item.status}`}>{statusNames[item.status]}</span></td><td><span className={`bo-status is-${item.priority}`}>{priorityNames[item.priority]}</span></td><td>{item.assignedToEmail || "尚未分配"}</td><td><span className={`bo-status is-${item.slaState}`}>{slaNames[item.slaState]}</span><small>{formatDate(item.dueAt)}</small></td><td><div className="bo-actions">{!item.assignedToUserId && item.status !== "resolved" && <button className="text-button" type="button" disabled={busy} onClick={() => void run({ action: "update", id: item.id, assigneeUserId: snapshot.currentUserId, status: "in_progress", expectedUpdatedAt: item.updatedAt }, "待办已分配给你")}>领取</button>}<a className="text-button" href={item.canonicalUrl}>去处理 →</a></div></td></tr>)}</tbody></table></div>
      {!items.length && <div className="bo-empty">当前筛选下没有待办事项。可以切换范围或清除筛选。</div>}
      <footer className="bo-pagination"><span>当前显示 {Math.min(items.length, 100)} / {items.length} 条 · 紧急 {snapshot?.metrics.urgent || 0} 条 · 即将超时 {snapshot?.metrics.dueSoon || 0} 条</span>{Object.values(filters).some((value) => value && value !== "active") && <button type="button" onClick={() => setFilters(initialFilters)}>清除筛选</button>}</footer>
    </section>
  </div>;
}
