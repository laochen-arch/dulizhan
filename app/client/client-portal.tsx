"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CmsAsset, CmsSite } from "../../db/cms";
import type { Product } from "../data/products";
import { formatMoney } from "../lib/format-money";
import { confirmBusinessNavigation, BackofficeShell, BusinessTable } from "../components/backoffice";
import { MerchantCatalog, MerchantInventory } from "../merchant/catalog-panel";
import { MerchantMarketing } from "../merchant/marketing-panel";
import { MerchantTeam, MerchantOrders, MerchantAfterSales } from "../merchant/service-panels";

export type PortalProduct = Pick<Product, "id" | "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "description" | "details" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "relatedSlugs">;
type Integration = { provider: "paypal" | "resend"; source: string; status: string; configured: boolean; hasEncryptionKey: boolean; environment?: "sandbox" | "live"; clientId: boolean; clientSecret: boolean; webhookId: boolean; apiKey: boolean; fromEmail: boolean; fromDomain: string | null; lastCheckedAt: string | null; lastError: string | null };
type PortalConfig = { brand?: Record<string, string>; assets?: { hero?: string }; content?: { contact?: Record<string, string> }; theme?: { colors?: Record<string, string> } };
export type PortalOrder = { id: string; orderNumber: string; customerName: string; email: string; currency: string; total: number; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string };
type PortalOverview = { siteId: string; role: "owner" | "editor" | "viewer"; merchantRole?: "merchant_owner" | "merchant_manager" | "merchant_staff" | "merchant_support"; capabilities?: string[]; snapshot: { config: PortalConfig; catalog: PortalProduct[] }; orders: PortalOrder[]; inventory: { products: number; lowStock: number; units: number }; integrations: Integration[] };
export type InventoryRow = { siteId: string; productId: string; variantId: string; sku: string; quantity: number; reservedQuantity: number; updatedAt: string; productName?: string; variantLabel?: string };
export type AfterSales = { id: string; orderId: string; orderNumber?: string; email: string; requestType: "refund" | "return" | "exchange"; reason: string; customerNote: string | null; adminNote: string | null; requestedAmount: number | null; status: string; createdAt: string; updatedAt: string; resolvedAt: string | null };
export type Coupon = { id: string; code: string; discountType: "percent" | "fixed"; discountValue: number; minSubtotal: number; maxUses: number | null; uses: number; startsAt: string | null; endsAt: string | null; active: boolean };
export type Bundle = { id: string; name: string; slug: string; productIds: string[]; discountType: "percent" | "fixed"; discountValue: number; active: boolean };
export type Collection = { id: string; name: string; slug: string; description: string | null; productIds: string[]; active: boolean; sortOrder: number };
export type Recommendation = { id: string; name: string; strategy: "manual" | "featured" | "category"; sourceProductId: string | null; productIds: string[]; active: boolean };
export type CampaignSchedule = { id: string; targetType: "coupon" | "bundle" | "collection" | "recommendation"; targetId: string; startsAt: string; endsAt: string | null; status: "scheduled" | "active" | "expired" | "cancelled" };
export type MerchantTeamMember = { siteId: string; userId: string; email: string; role: "merchant_owner" | "merchant_manager" | "merchant_staff" | "merchant_support"; source: string; createdAt: string; updatedAt: string };
type PortalSection = "brand" | "products" | "inventory" | "categories" | "customers" | "campaigns" | "team" | "orders" | "after-sales" | "operations" | "integrations";
type WorkspaceNavGroup = { label: string; items: Array<{ id: PortalSection; label: string }> };
export type ClientOrderDetail = { order: PortalOrder & { shippingAddress: Record<string, string>; subtotal: number; shipping: number; tax: number; refundTotal: number; paidAt: string | null; shippedAt: string | null; adminNote?: string | null }; items: Array<{ id: string; productId: string; variantId: string; sku: string; name: string; variantLabel: string; unitPrice: number; quantity: number }>; refunds: Array<{ id: string; amount: number; currency: string; reason: string | null; status: string; error: string | null; createdAt: string; completedAt: string | null }>; stateEvents: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>; afterSales: AfterSales[] };
type MerchantAnalytics = { days: number; paidOrders: number; revenue: number; openAbandonedCheckouts: number; events: Array<{ eventType: string; count: number }> };
type LaunchCenter = { readiness: { score: number; blockers: Array<{ key: string; label: string; detail: string; source: string }>; launch: { checks: Array<{ key: string; label: string; detail: string; done: boolean; required?: boolean }>; progress: { done: number; total: number } }; health: Array<{ key: string; status: string; detail: string; checkedAt: string }>; openOperations: number }; releases: Array<{ id: string; status: string; label: string; note: string | null; requestedByEmail: string; requestedAt: string; revisionId: string | null; publishedAt: string | null }>; diff: { totalChanges: number; changes: string[] }; operations: { orders: number; paidOrders: number; openAfterSales: number; lowStock: number; availableUnits: number; failedEvents: number } };

const portalSectionLabels: Record<PortalSection, string> = {
  brand: "店铺装修",
  products: "商品管理",
  inventory: "库存管理",
  categories: "商品分类",
  customers: "订单客户",
  campaigns: "营销活动",
  team: "员工权限",
  orders: "订单管理",
  "after-sales": "售后处理",
  operations: "经营概览",
  integrations: "支付与邮件",
};
const workspacePageCopy: Record<PortalSection, { eyebrow: string; title: string; description: string }> = {
  inventory: { eyebrow: "库存管理", title: "库存管理", description: "按 SKU 处理补货与盘点，已锁定库存不可扣减。" },
  categories: { eyebrow: "商品分类", title: "商品分类", description: "当前目录中的商品归类。分类名称通过商品编辑维护，不混用营销集合。" },
  customers: { eyebrow: "订单客户", title: "订单客户", description: "从当前已加载订单汇总客户，不代表全部注册消费者。" },
  brand: { eyebrow: "店铺装修", title: "让店铺保持统一的品牌形象。", description: "修改顾客看到的店铺名称、故事、联系方式和主题颜色。" },
  products: { eyebrow: "商品管理", title: "商品管理", description: "管理商品、价格和库存。" },
  campaigns: { eyebrow: "营销活动", title: "让顾客有再次购买的理由。", description: "设置优惠券、组合商品、商品集合和推荐规则。" },
  team: { eyebrow: "员工权限", title: "让每位员工只处理自己的工作。", description: "邀请员工并按岗位限制可操作的功能范围。" },
  orders: { eyebrow: "订单管理", title: "让每笔订单顺利进入下一步。", description: "查看付款、发货、物流和客户信息，及时处理订单异常。" },
  "after-sales": { eyebrow: "售后处理", title: "清楚记录每一个售后问题。", description: "跟踪退款、退货和换货申请，保留完整的处理记录。" },
  operations: { eyebrow: "经营概览", title: "今天需要处理什么，一眼看清。", description: "查看店铺准备度、订单、库存、售后和系统异常。" },
  integrations: { eyebrow: "支付与邮件", title: "让支付和通知稳定工作。", description: "检查 PayPal、Resend 和发布配置，确保顾客流程顺畅。" },
};
const portalSectionIds = Object.keys(portalSectionLabels) as PortalSection[];

const csvHeaders = ["id", "name", "slug", "shortName", "category", "sku", "status", "featured", "price", "compareAt", "description", "details", "image", "images", "alt", "badge", "colors", "tags", "stock"] as const;

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function productCsv(products: PortalProduct[]) {
  return [csvHeaders.join(","), ...products.map((product) => csvHeaders.map((header) => csvEscape(header === "images" ? product.images.join("|") : header === "colors" ? product.colors.join("|") : header === "tags" ? product.tags.join("|") : product[header])).join(","))].join("\n");
}

function downloadText(filename: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([`\ufeff${value}`], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}


export function ClientPortal({ userName, mode = "client" }: { userName: string; mode?: "client" | "merchant" }) {
  const searchParams = useSearchParams();
  const apiRoot = mode === "merchant" ? "/api/merchant" : "/api/client";
  const [sites, setSites] = useState<CmsSite[]>([]);
  const [siteId, setSiteId] = useState(searchParams.get("siteId") || "default");
  const tenantRef = useRef(siteId);
  useEffect(()=>{ tenantRef.current=siteId; },[siteId]);
  const [filterTerm,setFilterTerm]=useState(searchParams.get("filter")||"");
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [launch, setLaunch] = useState<(LaunchCenter & { analytics?: MerchantAnalytics }) | null>(null);
  const [assets, setAssets] = useState<CmsAsset[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [afterSales, setAfterSales] = useState<AfterSales[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [campaignSchedules, setCampaignSchedules] = useState<CampaignSchedule[]>([]);
  const [teamMembers, setTeamMembers] = useState<MerchantTeamMember[]>([]);
  const [section, setSection] = useState<PortalSection>(() => {
    const requested = searchParams.get("section") as PortalSection | null;
    return requested && portalSectionIds.includes(requested) ? requested : mode === "merchant" ? "operations" : "brand";
  });
  const [brand, setBrand] = useState({ name: "", mark: "", descriptor: "", tagline: "", hero: "", contactEmail: "", tradeEmail: "" });
  const [colors, setColors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [integrationForm, setIntegrationForm] = useState({ provider: "paypal" as "paypal" | "resend", clientId: "", clientSecret: "", webhookId: "", environment: "sandbox", apiKey: "", fromEmail: "" });
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const loadSites = useCallback(async () => {
    const response = await fetch(mode === "merchant" ? "/api/merchant/sites" : "/api/cms/sites", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { sites?: CmsSite[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load client sites.");
    const next = payload.sites || [];
    setSites(next);
    if (!next.some((item) => item.id === siteId) && next[0]) setSiteId(next[0].id);
  }, [mode, siteId]);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`${apiRoot}/overview?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => ({})) as PortalOverview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load this client site.");
    if(signal?.aborted || tenantRef.current!==siteId) return;
    setOverview(payload);
    setProducts(payload.snapshot.catalog || []);
    const config = payload.snapshot.config || {};
    setBrand({ name: config.brand?.name || "", mark: config.brand?.mark || "", descriptor: config.brand?.descriptor || "", tagline: config.brand?.tagline || "", hero: config.assets?.hero || "", contactEmail: config.content?.contact?.email || "", tradeEmail: config.content?.contact?.tradeEmail || "" });
    setColors({ ...(config.theme?.colors || {}) });
  }, [apiRoot, siteId]);

  const loadOperations = useCallback(async (signal?: AbortSignal) => {
    const query = `?siteId=${encodeURIComponent(siteId)}`;
    const [launchResponse, inventoryResponse, assetsResponse, afterSalesResponse] = await Promise.all([
      fetch(`${mode === "merchant" ? "/api/merchant/operations" : "/api/cms/launch-center"}${query}`, { cache: "no-store", signal }),
      fetch(`${apiRoot}/inventory${query}`, { cache: "no-store", signal }),
      fetch(`${mode === "merchant" ? "/api/merchant/assets" : "/api/cms/assets"}${query}`, { cache: "no-store", signal }),
      fetch(`${apiRoot}/after-sales${query}`, { cache: "no-store", signal }),
    ]);
    const [launchPayload, inventoryPayload, assetsPayload, afterSalesPayload] = await Promise.all([
      launchResponse.json().catch(() => ({})) as Promise<LaunchCenter & { error?: string }>,
      inventoryResponse.json().catch(() => ({})) as Promise<{ inventory?: InventoryRow[] }>,
      assetsResponse.json().catch(() => ({})) as Promise<{ assets?: CmsAsset[] }>,
      afterSalesResponse.json().catch(() => ({})) as Promise<{ requests?: AfterSales[] }>,
    ]);
    if (!launchResponse.ok) throw new Error(launchPayload.error || "Unable to load operations.");
    if(signal?.aborted || tenantRef.current!==siteId) return;
    setLaunch(launchPayload);
    if (inventoryResponse.ok) setInventory(inventoryPayload.inventory || []);
    if (assetsResponse.ok) setAssets(assetsPayload.assets || []);
    if (afterSalesResponse.ok) setAfterSales(afterSalesPayload.requests || []);
    if (mode === "merchant") {
      const campaignResponse = await fetch(`${apiRoot}/campaigns${query}`, { cache: "no-store", signal });
      const campaignPayload = await campaignResponse.json().catch(() => ({})) as { coupons?: Coupon[]; bundles?: Bundle[]; collections?: Collection[]; recommendations?: Recommendation[]; schedules?: CampaignSchedule[] };
      if(signal?.aborted || tenantRef.current!==siteId) return;
      if (campaignResponse.ok) { setCoupons(campaignPayload.coupons || []); setBundles(campaignPayload.bundles || []); setCollections(campaignPayload.collections || []); setRecommendations(campaignPayload.recommendations || []); setCampaignSchedules(campaignPayload.schedules || []); }
      const teamResponse = await fetch(`${apiRoot}/team${query}`, { cache: "no-store", signal });
      const teamPayload = await teamResponse.json().catch(() => ({})) as { members?: MerchantTeamMember[] };
      if(signal?.aborted || tenantRef.current!==siteId) return;
      if (teamResponse.ok) setTeamMembers(teamPayload.members || []);
    }
  }, [apiRoot, mode, siteId]);

  // These effects synchronize tenant-scoped D1 state into the customer workspace.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSites().catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load client sites." })); }, [loadSites]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const abort=new AbortController(); setOverview(null);setLaunch(null);setProducts([]);setInventory([]);setAssets([]);setAfterSales([]);setCoupons([]);setBundles([]);setCollections([]);setRecommendations([]);setCampaignSchedules([]);setTeamMembers([]);setNotice(null);void Promise.all([loadOverview(abort.signal), loadOperations(abort.signal)]).catch((error) => {if(!abort.signal.aborted)setNotice({ tone: "error", text: error instanceof Error ? error.message : "店铺资料读取失败。" });});return()=>abort.abort(); }, [loadOperations, loadOverview]);

  const activeSite = useMemo(() => sites.find((item) => item.id === siteId), [siteId, sites]);
  const capabilities = useMemo(() => new Set(overview?.capabilities || []), [overview?.capabilities]);
  const canEdit = mode === "merchant" ? section === "products" ? capabilities.has("products.write") : section === "orders" ? capabilities.has("orders.write") : section === "after-sales" ? capabilities.has("after-sales.write") : capabilities.has("merchant.storefront.write") : overview?.role === "owner" || overview?.role === "editor";
  const canMarketing = mode === "merchant" && capabilities.has("marketing.write");
  const canTeam = mode === "merchant" && capabilities.has("merchant.team.manage");
  const canConfigure = mode === "merchant" ? capabilities.has("merchant.settings.write") : overview?.role === "owner";
  const merchantRoleLabel = overview?.merchantRole === "merchant_owner" ? "店铺所有者" : overview?.merchantRole === "merchant_manager" ? "店铺管理员" : overview?.merchantRole === "merchant_staff" ? "订单与履约人员" : overview?.merchantRole === "merchant_support" ? "售后客服" : overview?.role || "Workspace";
  const activePageCopy = workspacePageCopy[section];
  const workspaceNavGroups = useMemo<WorkspaceNavGroup[]>(() => {
    if (mode !== "merchant") {
      return [{ label: "店铺设置", items: [{ id: "brand", label: "店铺装修" }, { id: "products", label: "商品管理" }, { id: "operations", label: "上线检查" }, { id: "integrations", label: "支付与邮件" }] }];
    }
    const has = (capability: string) => capabilities.has(capability);
    const item = (id: PortalSection, label: string) => ({ id, label });
    return [
      { label: "店铺经营", items: [item("operations", "经营概览"), ...(has("merchant.storefront.write") ? [item("brand", "店铺装修")] : []), ...(has("products.read") ? [item("products", "商品管理"), item("categories", "商品分类")] : []), ...(has("inventory.read") ? [item("inventory", "库存管理")] : []), ...(has("marketing.read") ? [item("campaigns", "营销活动")] : [])] },
      { label: "订单售后", items: [...(has("orders.read") ? [item("orders", "订单管理"), item("customers", "订单客户")] : []), ...(has("after-sales.read") ? [item("after-sales", "售后处理")] : [])] },
      { label: "设置与权限", items: [...(canConfigure ? [item("integrations", "支付与邮件")] : []), ...(canTeam ? [item("team", "员工权限")] : [])] },
    ].filter((group) => group.items.length);
  }, [canConfigure, canTeam, capabilities, mode]);
  const selectSection = useCallback((nextSection: PortalSection, filter = "") => {
    if(!confirmBusinessNavigation())return;
    setSection(nextSection);
    setFilterTerm(filter);
    const params = new URLSearchParams(window.location.search);
    params.delete("view"); params.delete("record");
    if(filter)params.set("filter",filter);else params.delete("filter");
    params.set("section", nextSection);
    params.set("siteId", siteId);
    window.history.pushState({}, "", `${mode === "merchant" ? "/merchant" : "/client"}?${params.toString()}`);
    window.dispatchEvent(new Event("workspace:navigate"));
  }, [mode, siteId]);
  useEffect(() => {
    const syncSectionFromHistory = () => {
      const requested = new URLSearchParams(window.location.search).get("section") as PortalSection | null;
      if (requested && portalSectionIds.includes(requested)) setSection(requested);
      setFilterTerm(new URLSearchParams(window.location.search).get("filter")||"");
    };
    window.addEventListener("popstate", syncSectionFromHistory);
    return () => window.removeEventListener("popstate", syncSectionFromHistory);
  }, []);
  const paypal = overview?.integrations.find((item) => item.provider === "paypal");
  const resend = overview?.integrations.find((item) => item.provider === "resend");

  async function saveBrand(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${apiRoot}/brand`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, brand: { name: brand.name, mark: brand.mark, descriptor: brand.descriptor, tagline: brand.tagline }, hero: brand.hero, contactEmail: brand.contactEmail, tradeEmail: brand.tradeEmail, colors }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save brand settings.");
      setNotice({ tone: "success", text: "Brand settings saved to the draft storefront." });
      await Promise.all([loadOverview(), loadOperations()]);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save brand settings." }); }
    finally { setBusy(false); }
  }

  function exportProducts() {
    downloadText(`${activeSite?.slug || "client-site"}-products.csv`, productCsv(products), "text/csv;charset=utf-8");
    setNotice({ tone: "success", text: "Draft product CSV exported." });
  }

  async function saveIntegration(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(`${apiRoot}/integrations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, ...integrationForm }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save integration settings.");
      setIntegrationForm((current) => ({ ...current, clientId: "", clientSecret: "", webhookId: "", apiKey: "", fromEmail: "" }));
      setNotice({ tone: "success", text: "Credentials were encrypted and saved for this tenant only." });
      await Promise.all([loadOverview(), loadOperations()]);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save integration settings." }); }
    finally { setBusy(false); }
  }

  async function requestRelease() {
    setBusy(true);
    try {
      const response = await fetch(`${mode === "merchant" ? "/api/merchant/releases" : "/api/cms/releases"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, label: "Merchant storefront release", note: releaseNote }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to request release.");
      setReleaseNote("");
      await loadOperations();
      setNotice({ tone: "success", text: "发布申请 sent to the site owner." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to request release." }); }
    finally { setBusy(false); }
  }

  async function copyPreviewShare() {
    setBusy(true);
    try {
      const response = await fetch(`${mode === "merchant" ? "/api/merchant/preview-share" : "/api/cms/preview-share"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, hours: 24 }) });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Unable to create preview link.");
      await navigator.clipboard?.writeText(payload.url);
      setNotice({ tone: "success", text: "24-hour draft preview link copied." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to create preview link." }); }
    finally { setBusy(false); }
  }

  if (!overview || overview.siteId!==siteId) return <BackofficeShell workspaceRole="merchant" brand="商家工作台" title="读取店铺" description="正在核对店铺权限和业务资料。" current="" groups={[]} onNavigate={()=>{}} user={userName}><div className="bo-card" role={notice?.tone==="error"?"alert":"status"}>{notice?.text || "正在读取当前店铺…"}{notice?.tone==="error"&&<button type="button" className="button button-outline" onClick={()=>window.location.reload()}>重新读取</button>}</div></BackofficeShell>;

  return <BackofficeShell workspaceRole="merchant" brand={activeSite?.name || "商家工作台"} title={portalSectionLabels[section]} description={activePageCopy.description} current={section} groups={workspaceNavGroups} onNavigate={id => selectSection(id as PortalSection)} user={userName}
    context={<><label>当前店铺<select value={siteId} onChange={event => {if(!confirmBusinessNavigation())return;setSiteId(event.target.value);setSection("operations");setFilterTerm("");const params=new URLSearchParams({siteId:event.target.value,section:"operations"});window.history.replaceState({},"",window.location.pathname+"?"+params);window.dispatchEvent(new Event("workspace:navigate"));}}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><span>{merchantRoleLabel}</span></>}
    actions={<a className="button button-outline" href={`/preview?siteId=${encodeURIComponent(siteId)}`} target="_blank" rel="noreferrer">预览店铺 ↗</a>}
    status={notice && <div className={notice.tone === "error" ? "bo-error" : "bo-info"} role="status">{notice.text}<button type="button" className="text-button" onClick={() => setNotice(null)} aria-label="关闭消息"> ×</button></div>}>

        {!workspaceNavGroups.some(group=>group.items.some(item=>item.id===section)) ? <div className="bo-empty">当前岗位没有此功能权限，请使用左侧菜单。</div> : <>
        {section === "brand" && <form className="client-portal-grid" onSubmit={saveBrand}><article className="client-portal-card"><p className="eyebrow">店铺品牌</p><h2>品牌与首页展示</h2><div className="v6-form-grid"><label className="v6-field"><span>品牌名称</span><input value={brand.name} onChange={(event) => setBrand((current) => ({ ...current, name: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Logo 标识</span><input value={brand.mark} onChange={(event) => setBrand((current) => ({ ...current, mark: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>品牌标语</span><input value={brand.tagline} onChange={(event) => setBrand((current) => ({ ...current, tagline: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>品牌介绍</span><input value={brand.descriptor} onChange={(event) => setBrand((current) => ({ ...current, descriptor: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>首页大图地址</span><input value={brand.hero} onChange={(event) => setBrand((current) => ({ ...current, hero: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>客服邮箱</span><input type="email" value={brand.contactEmail} onChange={(event) => setBrand((current) => ({ ...current, contactEmail: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>商务邮箱</span><input type="email" value={brand.tradeEmail} onChange={(event) => setBrand((current) => ({ ...current, tradeEmail: event.target.value }))} disabled={!canEdit} /></label></div><div className="client-color-grid">{["ink", "paper", "warm", "rust", "sage"].map((key) => <label className="v6-field" key={key}><span>{key}</span><input type="text" value={colors[key] || ""} onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))} disabled={!canEdit} /></label>)}</div><button className="button button-dark" disabled={!canEdit || busy}>{busy ? "正在保存…" : "保存店铺草稿"}</button></article><aside className="client-portal-card client-portal-callout"><p className="eyebrow">发布规则</p><h2>保存草稿，审核后发布</h2><p className="v6-muted">商城继续显示已发布内容，草稿通过检查和负责人审核后才更新。</p><div className="client-check-list"><span>✓ 资料按店铺独立保存</span><span>✓ 手动保存后进入店铺草稿</span><span>✓ 限时预览链接自动过期</span></div></aside></form>}

        {section === "products" && <MerchantCatalog key={siteId+filterTerm} initialFilter={filterTerm} siteId={siteId} products={products} assets={assets} canWrite={capabilities.has("products.write")} onProducts={setProducts} onExport={exportProducts}/>}
        {section === "inventory" && <MerchantInventory siteId={siteId} rows={inventory} canWrite={capabilities.has("inventory.write")} onRows={setInventory}/>}
        {section === "categories" && <BusinessTable title="商品分类" rows={[...new Set(products.map(p=>p.category))].map(name=>({name,count:products.filter(p=>p.category===name).length}))} rowKey={row=>row.name} searchText={row=>row.name} columns={[{label:"分类名称",render:row=>row.name},{label:"关联商品",render:row=>row.count}]} onOpen={row=>selectSection("products",row.name)} openLabel="管理分类商品"/>}
        {section === "customers" && <BusinessTable title="订单客户" rows={[...new Set(overview.orders.map(o=>o.email))].map(email=>({email,name:overview.orders.find(o=>o.email===email)?.customerName||email,count:overview.orders.filter(o=>o.email===email).length}))} rowKey={row=>row.email} searchText={row=>row.name+" "+row.email} columns={[{label:"客户",render:row=>row.name},{label:"邮箱",render:row=>row.email},{label:"当前加载订单数",render:row=>row.count}]} onOpen={row=>selectSection("orders",row.email)} openLabel="查看订单"/>}

        {section === "orders" && <MerchantOrders key={siteId+filterTerm} initialFilter={filterTerm} siteId={siteId} orders={overview.orders} canWrite={capabilities.has("orders.write")} canRefund={capabilities.has("orders.refund")} onUpdated={loadOverview}/>}

        {section === "after-sales" && <MerchantAfterSales siteId={siteId} requests={afterSales} canWrite={capabilities.has("after-sales.write")} onRequests={setAfterSales}/>}

            {section === "operations" && <section className="v24-launch-shell">{launch && <><div className="v6-card v24-launch-hero"><div><p className="eyebrow">店铺经营概况</p><h2>{launch.readiness.score}% 发布准备度。</h2><p className="v6-muted">先处理缺失资料，再提交发布审核，草稿修改不会直接覆盖已上线商城。</p></div><div className="v24-score"><strong>{launch.operations.availableUnits}</strong><span>可售库存</span></div></div><div className="v24-metrics"><div><span>Orders</span><strong>{launch.operations.orders}</strong></div><div><span>Paid</span><strong>{launch.operations.paidOrders}</strong></div><div><span>After-sales</span><strong>{launch.operations.openAfterSales}</strong></div><div><span>Low stock</span><strong>{launch.operations.lowStock}</strong></div><div><span>Failed events</span><strong>{launch.operations.failedEvents}</strong></div></div><div className="v6-grid"><article className="v6-card"><p className="eyebrow">待处理事项</p><h3>{launch.readiness.blockers.length} 项待处理。</h3><div className="v24-list">{launch.readiness.blockers.map((item) => <div key={item.key}><span className="v24-dot error">!</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}{!launch.readiness.blockers.length && <div className="v6-empty">暂无待修复项。</div>}</div></article><article className="v6-card"><p className="eyebrow">发布申请</p><h3>提交店铺发布审核</h3><label className="v6-field"><span>变更说明</span><textarea value={releaseNote} onChange={(event) => setReleaseNote(event.target.value)} disabled={!canEdit} placeholder="Summarize what changed." /></label><button type="button" className="button button-dark" onClick={() => void requestRelease()} disabled={!canEdit || busy || !launch.diff.totalChanges}>提交审核 →</button><div className="v24-release-list">{launch.releases.slice(0, 5).map((release) => <div key={release.id}><div><strong>{release.status}</strong><small>{release.label} · {new Date(release.requestedAt).toLocaleString()}</small></div></div>)}</div></article></div></>}</section>}

            {section === "integrations" && <section className="client-portal-grid"><article className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">支付与邮件配置</p><h2>独立配置当前店铺</h2></div><span>{canConfigure ? "Owner" : "Read only"}</span></div><div className="integration-status-grid"><div><strong>PayPal</strong><span className={`v22-status ${paypal?.status || "missing"}`}>{paypal?.status || "missing"}</span><small>{paypal?.source || "missing"} · {paypal?.environment || "sandbox"}</small></div><div><strong>Resend</strong><span className={`v22-status ${resend?.status || "missing"}`}>{resend?.status || "missing"}</span><small>{resend?.source || "missing"} · {resend?.fromDomain || "sender domain not set"}</small></div></div><p className="v6-help">密钥不会回传浏览器；需先完成平台加密配置。留空字段保留原值。</p>{canConfigure && <form className="v6-form" onSubmit={saveIntegration}><label className="v6-field"><span>Provider</span><select value={integrationForm.provider} onChange={(event) => setIntegrationForm((current) => ({ ...current, provider: event.target.value as "paypal" | "resend" }))}><option value="paypal">PayPal</option><option value="resend">Resend</option></select></label>{integrationForm.provider === "paypal" ? <div className="v6-form-grid"><label className="v6-field"><span>Client ID</span><input value={integrationForm.clientId} onChange={(event) => setIntegrationForm((current) => ({ ...current, clientId: event.target.value }))} placeholder="Replace client ID" /></label><label className="v6-field"><span>Client secret</span><input type="password" value={integrationForm.clientSecret} onChange={(event) => setIntegrationForm((current) => ({ ...current, clientSecret: event.target.value }))} placeholder="Replace secret" /></label><label className="v6-field"><span>Webhook ID</span><input value={integrationForm.webhookId} onChange={(event) => setIntegrationForm((current) => ({ ...current, webhookId: event.target.value }))} placeholder="Webhook ID" /></label><label className="v6-field"><span>Environment</span><select value={integrationForm.environment} onChange={(event) => setIntegrationForm((current) => ({ ...current, environment: event.target.value }))}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label></div> : <div className="v6-form-grid"><label className="v6-field"><span>Resend API key</span><input type="password" value={integrationForm.apiKey} onChange={(event) => setIntegrationForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Replace API key" /></label><label className="v6-field"><span>From email</span><input type="email" value={integrationForm.fromEmail} onChange={(event) => setIntegrationForm((current) => ({ ...current, fromEmail: event.target.value }))} placeholder="orders@client-domain.com" /></label></div>}<button className="button button-dark" disabled={busy}>{busy ? "正在加密保存…" : "保存加密配置"}</button></form>}</article><aside className="client-portal-card client-portal-callout"><p className="eyebrow">预览与发布</p><h2>预览尚未发布的修改</h2><p className="v6-muted">可生成限时预览链接供确认，发布与回滚由有权限的负责人处理。</p><button type="button" className="button button-outline" onClick={() => void copyPreviewShare()} disabled={!canEdit || busy}>复制限时预览链接</button></aside></section>}
        {section === "campaigns" && <MerchantMarketing siteId={siteId} products={products} data={{coupons,bundles,collections,recommendations,schedules:campaignSchedules}} canWrite={canMarketing} onChange={next=>{if(next.coupons)setCoupons(next.coupons);if(next.bundles)setBundles(next.bundles);if(next.collections)setCollections(next.collections);if(next.recommendations)setRecommendations(next.recommendations);if(next.schedules)setCampaignSchedules(next.schedules);}}/>}
        {section === "team" && <MerchantTeam siteId={siteId} members={teamMembers} canWrite={canTeam} onMembers={setTeamMembers}/>}
            {section === "operations" && mode === "merchant" && launch?.analytics && <section className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">经营数据</p><h2>经营数据概览</h2></div><span>Last {launch.analytics.days} days</span></div><div className="v24-metrics"><div><span>Revenue</span><strong>{formatMoney(launch.analytics.revenue, "usd")}</strong></div><div><span>Paid orders</span><strong>{launch.analytics.paidOrders}</strong></div><div><span>Open carts</span><strong>{launch.analytics.openAbandonedCheckouts}</strong></div>{launch.analytics.events.slice(0, 3).map((event) => <div key={event.eventType}><span>{event.eventType.replaceAll("_", " ")}</span><strong>{event.count}</strong></div>)}</div></section>}
    </>}
  </BackofficeShell>;
}
