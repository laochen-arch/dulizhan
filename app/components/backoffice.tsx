"use client";

import { Children, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export type BackofficeNavGroup = { label: string; items: { id: string; label: string }[] };

export function confirmBusinessNavigation() {
  return window.dispatchEvent(new Event("workspace:before-navigate", {cancelable:true}));
}

// Separate existing business tools into focused tasks without changing their API logic.
export function TaskSections({labels,children,className=""}:{labels:string[];children:ReactNode;className?:string}) {
  const sections=Children.toArray(children);
  const [selected,setSelected]=useState(0);
  return <section className={className}><div className="bo-subnav" aria-label="业务操作分区">{sections.map((_,index)=><button key={index} className={selected===index?"is-active":""} type="button" onClick={()=>{if(confirmBusinessNavigation())setSelected(index);}}>{labels[index]||"相关操作"}</button>)}</div>{sections[selected]||sections[0]}</section>;
}

export function BackofficeShell({ workspaceRole: role, brand, title, description, current, groups, onNavigate, children, context, actions, user, status }: {
  workspaceRole: "merchant" | "platform"; brand: string; title: string; description: string; current: string;
  groups: BackofficeNavGroup[]; onNavigate: (id: string) => void; children: ReactNode;
  context?: ReactNode; actions?: ReactNode; user?: string; status?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const roleName = role === "merchant" ? "商家后台" : "运营后台";
  const results = groups.flatMap(group => group.items).filter(item => item.label.includes(query.trim()));
  return <div className={`backoffice backoffice-${role}`}>
    <aside className={`bo-sidebar${menuOpen ? " is-open" : ""}`} aria-label={`${roleName}导航`}>
      <div className="bo-brand"><span className="bo-mark">{role === "platform" ? "P" : "N"}</span><span><strong>{brand}</strong><small>{roleName} · {role === "merchant" ? "店铺经营" : "商户服务"}</small></span></div>
      <nav>{groups.map((group,index) => { const expanded=!closedGroups.includes(group.label);return <div className="bo-nav-group" key={group.label}><button type="button" className="bo-group-toggle" aria-expanded={expanded} aria-controls={`bo-nav-${role}-${index}`} onClick={()=>setClosedGroups(value=>expanded?[...value,group.label]:value.filter(label=>label!==group.label))}>{group.label}<span aria-hidden="true">{expanded?"⌄":"›"}</span></button><div id={`bo-nav-${role}-${index}`} hidden={!expanded}>{group.items.map(item => <button type="button" key={item.id} className={current === item.id ? "is-active" : ""} aria-current={current === item.id ? "page" : undefined} onClick={() => { onNavigate(item.id); setMenuOpen(false); }}>{item.label}</button>)}</div></div>;})}</nav>
      <div className="bo-sidebar-note">{role === "merchant" ? "商品、订单和库存只属于当前店铺。" : "审核入驻、交付站点、跟进商户问题。"}</div>
    </aside>
    <div className="bo-main">
      <header className="bo-topbar"><button type="button" className="bo-mobile-toggle" aria-label="展开或收起菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button><nav className="bo-breadcrumb" aria-label="当前位置"><button type="button" onClick={() => onNavigate(groups[0]?.items[0]?.id || current)}>{roleName}</button><span>/</span><strong>{title}</strong></nav><div className="bo-search"><label><span className="sr-only">搜索当前角色的功能</span><input type="search" placeholder="搜索功能" value={query} onKeyDown={event=>{if(event.key==="Escape")setQuery("");}} onChange={event => setQuery(event.target.value)} /></label>{query.trim() && <div className="bo-search-results">{results.map(item => <button type="button" key={item.id} onClick={() => { onNavigate(item.id); setQuery(""); }}>{item.label}</button>)}{!results.length && <p>没有匹配的功能，请换个关键词。</p>}</div>}</div><span className="bo-user">{user || roleName}</span><a className="text-button" href={"/signout-with-chatgpt?return_to="+encodeURIComponent(role==="merchant"?"/merchant":"/admin")}>退出</a></header>
      <div className="bo-content"><div className="bo-page-heading"><div><p className="bo-eyebrow">{roleName}</p><h1>{title}</h1><p>{description}</p></div><div className="bo-actions">{actions}</div></div>{context && <div className="bo-context">{context}</div>}{status}{children}</div>
    </div>
  </div>;
}

export function BusinessTable<T>({ title, rows, columns, rowKey, searchText, status, actions, empty = "暂无记录。", onOpen, openLabel = "查看详情", initialQuery = "" }: {
  title: string; rows: T[]; columns: { label: string; render: (row: T) => ReactNode }[];
  rowKey: (row: T) => string; searchText: (row: T) => string; status?: (row: T) => string;
  actions?: ReactNode; empty?: string; onOpen?: (row: T) => void; openLabel?: string; initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery); const [filter, setFilter] = useState(""); const [index, setIndex] = useState(0);
  const matches = useMemo(() => rows.filter(row => searchText(row).toLowerCase().includes(query.trim().toLowerCase()) && (!filter || status?.(row) === filter)), [rows, query, filter, searchText, status]);
  const page = Math.min(index, Math.max(0, Math.ceil(matches.length / 10) - 1));
  const statuses = status ? [...new Set(rows.map(status))] : [];
  return <section className="bo-card"><header className="bo-card-heading"><h2>{title}</h2><div className="bo-actions">{actions}</div></header><div className="bo-filters"><label><span className="sr-only">搜索{title}</span><input type="search" placeholder="搜索名称、编号或邮箱" value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} /></label>{status && <label><span className="sr-only">筛选{title}状态</span><select value={filter} onChange={event => { setFilter(event.target.value); setIndex(0); }}><option value="">全部状态</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>}</div><div className="bo-table-scroll"><table><thead><tr>{columns.map(column => <th key={column.label} scope="col">{column.label}</th>)}{onOpen && <th scope="col">操作</th>}</tr></thead><tbody>{matches.slice(page * 10, page * 10 + 10).map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.label}>{column.render(row)}</td>)}{onOpen && <td><button className="text-button" type="button" onClick={() => onOpen(row)}>{openLabel} →</button></td>}</tr>)}</tbody></table></div>{!matches.length && <div className="bo-empty">{rows.length ? "没有符合条件的记录，请调整搜索或筛选。" : empty}</div>}<footer className="bo-pagination"><span>共 {matches.length} 条 · 第 {page + 1} / {Math.max(1, Math.ceil(matches.length / 10))} 页</span><div><button type="button" disabled={!page} onClick={() => setIndex(page - 1)}>上一页</button><button type="button" disabled={(page + 1) * 10 >= matches.length} onClick={() => setIndex(page + 1)}>下一页</button></div></footer></section>;
}

export function RecordPage({ title, description, onBack, children, aside }: { title: string; description?: string; onBack: () => void; children: ReactNode; aside?: ReactNode }) {
  return <section className="bo-record"><header className="bo-record-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="button button-outline" onClick={onBack}>返回列表</button></header><div className={aside ? "bo-record-layout" : ""}><div>{children}</div>{aside && <aside>{aside}</aside>}</div></section>;
}

export function BusinessField({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className="bo-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

// Only presentation state belongs in the URL. Business records always come from authenticated APIs.
export function useBusinessView(scope: string) {
  const [selection, setSelection] = useState({ scope, view: "", record: "" });
  useEffect(() => {
    const sync = () => { const params = new URLSearchParams(window.location.search); setSelection({ scope, view: params.get("view") || "", record: params.get("record") || "" }); };
    sync(); window.addEventListener("popstate", sync); window.addEventListener("workspace:navigate", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("workspace:navigate", sync); };
  }, [scope]);
  function open(view = "", record = "") {
    if(!confirmBusinessNavigation())return;
    const params = new URLSearchParams(window.location.search);
    if(view) params.set("view", view); else params.delete("view");
    if(record) params.set("record", record); else params.delete("record");
    window.history.pushState({}, "", `${window.location.pathname}?${params}`);
    setSelection({scope, view, record});
  }
  return { view: selection.scope === scope ? selection.view : "", record: selection.scope === scope ? selection.record : "", open };
}

export function AsyncForm({ onSave, onSaved, children, label = "保存", disabled = false }: { onSave: (form: FormData) => Promise<void>; onSaved?: () => void; children: ReactNode; label?: string; disabled?: boolean }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const errorId = useId();
  const dirty=useRef(false),saving=useRef(false);
  useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue="";}};const navigate=(event:Event)=>{if(dirty.current&&!saving.current&&!window.confirm("有尚未保存的修改，确认离开？"))event.preventDefault();};window.addEventListener("beforeunload",leave);window.addEventListener("workspace:before-navigate",navigate);return()=>{window.removeEventListener("beforeunload",leave);window.removeEventListener("workspace:before-navigate",navigate);};},[]);
  return <form className="bo-form" onChange={()=>{dirty.current=true;}} onSubmit={async event => { event.preventDefault(); if(saving.current||disabled) return; const form = new FormData(event.currentTarget); saving.current=true;setBusy(true); setError(""); try { await onSave(form);dirty.current=false; onSaved?.(); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); } finally {saving.current=false; setBusy(false); } }} aria-describedby={error ? errorId : undefined}><fieldset disabled={busy || disabled}>{children}</fieldset>{error && <div className="bo-error" id={errorId} role="alert">{error}</div>}<footer className="bo-form-footer"><button type="submit" className="button button-dark" disabled={busy || disabled}>{busy ? "正在保存…" : label}</button></footer></form>;
}
