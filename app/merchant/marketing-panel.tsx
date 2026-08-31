"use client";
import type { PortalProduct, Coupon, Bundle, Collection, Recommendation, CampaignSchedule } from "../client/client-portal";
import { AsyncForm, BusinessField as Field, BusinessTable, RecordPage, useBusinessView } from "../components/backoffice";
import { merchantWrite } from "./workspace-api";

type Marketing = { coupons: Coupon[]; bundles: Bundle[]; collections: Collection[]; recommendations: Recommendation[]; schedules: CampaignSchedule[] };
type Kind = "coupon" | "bundle" | "collection" | "recommendation" | "schedule";
const names: Record<Kind,string> = {coupon:"优惠券",bundle:"组合商品",collection:"商品集合",recommendation:"推荐规则",schedule:"活动排期"};

export function MerchantMarketing({siteId,products,data,canWrite,onChange}:{siteId:string;products:PortalProduct[];data:Marketing;canWrite:boolean;onChange:(data:Partial<Marketing>)=>void}) {
  const {view,record,open}=useBusinessView(siteId+":marketing");
  const kind=view.replace(/^(new|edit)-/,"") as Kind;
  const rows=[...data.coupons.map(value=>({id:value.id,name:value.code,kind:"coupon" as Kind,status:value.active?"启用":"暂停",summary:`${value.discountType==="percent"?value.discountValue+"%": "$"+value.discountValue} · 已用 ${value.uses}`})),...data.bundles.map(value=>({id:value.id,name:value.name,kind:"bundle" as Kind,status:value.active?"启用":"暂停",summary:`${value.productIds.length} 件商品`})),...data.collections.map(value=>({id:value.id,name:value.name,kind:"collection" as Kind,status:value.active?"启用":"暂停",summary:`${value.productIds.length} 件商品`})),...data.recommendations.map(value=>({id:value.id,name:value.name,kind:"recommendation" as Kind,status:value.active?"启用":"暂停",summary:value.strategy})),...data.schedules.map(value=>({id:value.id,name:`${names[value.targetType]}排期`,kind:"schedule" as Kind,status:value.status,summary:new Date(value.startsAt).toLocaleString()}))];
  if(kind in names){
    const entries=kind==="coupon"?data.coupons:kind==="bundle"?data.bundles:kind==="collection"?data.collections:kind==="recommendation"?data.recommendations:data.schedules;
    const current=entries.find(value=>value.id===record);
    if(view.startsWith("edit")&&!current)return <RecordPage title="活动不存在" onBack={()=>open()}><p className="bo-empty">请返回列表刷新。</p></RecordPage>;
    const coupon=kind==="coupon"?current as Coupon|undefined:undefined;
    const bundle=kind==="bundle"?current as Bundle|undefined:undefined;
    const collection=kind==="collection"?current as Collection|undefined:undefined;
    const recommendation=kind==="recommendation"?current as Recommendation|undefined:undefined;
    const schedule=kind==="schedule"?current as CampaignSchedule|undefined:undefined;
    const selected=(bundle||collection||recommendation)?.productIds||[];
    return <RecordPage title={(current?"编辑":"创建")+names[kind]} onBack={()=>open()} description="每类活动分别保存到当前店铺；修改不会影响其他商户。"><div className="bo-card"><AsyncForm key={`${view}:${record}`} disabled={!canWrite||!!schedule} onSave={async form=>{
      const raw=Object.fromEntries(form), productIds=form.getAll("productIds").map(String);
      const discountValue=Number(raw.discountValue||0);if(raw.discountType==="percent"&&discountValue>100)throw new Error("百分比优惠不能超过 100。");
      if(kind==="bundle"&&productIds.length<2)throw new Error("组合商品至少选择两件商品。");
      if(kind==="collection"&&!productIds.length)throw new Error("商品集合至少选择一件商品。");
      if(kind==="recommendation"&&raw.strategy==="manual"&&!productIds.length)throw new Error("手动推荐至少选择一件商品。");
      if(kind==="schedule"&&raw.endsAt&&new Date(String(raw.endsAt))<=new Date(String(raw.startsAt)))throw new Error("结束时间必须晚于开始时间。");
      let fields:Record<string,unknown>={type:kind,...(current?{id:current.id}:{}),active:raw.active==="on"};
      if(kind==="coupon")fields={...fields,code:raw.code,discountType:raw.discountType,discountValue,minSubtotal:Number(raw.minSubtotal||0),maxUses:raw.maxUses?Number(raw.maxUses):null};
      if(kind==="bundle")fields={...fields,name:raw.name,slug:raw.slug,productIds,discountType:raw.discountType,discountValue};
      if(kind==="collection")fields={...fields,name:raw.name,slug:raw.slug,description:raw.description,productIds,sortOrder:Number(raw.sortOrder||0)};
      if(kind==="recommendation")fields={...fields,name:raw.name,strategy:raw.strategy,sourceProductId:raw.sourceProductId||undefined,category:raw.category||undefined,productIds};
      if(kind==="schedule"){const [targetType,...id]=String(raw.target).split(":");fields={...fields,targetType,targetId:id.join(":"),startsAt:new Date(String(raw.startsAt)).toISOString(),endsAt:raw.endsAt?new Date(String(raw.endsAt)).toISOString():null};}
      onChange(await merchantWrite<Partial<Marketing>>(siteId,"campaigns","POST",fields));open();
    }}>
      {kind==="coupon"&&<><div className="bo-form-grid"><Field label="优惠码 *" help={coupon?"编码是此券的唯一标识，修改规则时保持不变。":undefined}><input name="code" required readOnly={!!coupon} pattern="[A-Za-z0-9_-]+" defaultValue={coupon?.code}/></Field><Field label="最低订单金额（USD）"><input name="minSubtotal" type="number" min="0" step="0.01" defaultValue={coupon?.minSubtotal||0}/></Field><Field label="总使用次数（留空不限）"><input name="maxUses" type="number" min="1" step="1" defaultValue={coupon?.maxUses||""}/></Field></div></>}
      {(kind==="bundle"||kind==="collection"||kind==="recommendation")&&<Field label={`${names[kind]}名称 *`}><input name="name" required defaultValue={(bundle||collection||recommendation)?.name}/></Field>}
      {(kind==="bundle"||kind==="collection")&&<Field label="唯一访问标识 *" help="使用小写英文、数字和连字符。已有记录不可更改。"><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!current} defaultValue={(bundle||collection)?.slug}/></Field>}
      {(kind==="coupon"||kind==="bundle")&&<div className="bo-form-grid"><Field label="优惠方式"><select name="discountType" defaultValue={(coupon||bundle)?.discountType||"percent"}><option value="percent">百分比优惠</option><option value="fixed">固定金额优惠</option></select></Field><Field label="优惠数值 *"><input name="discountValue" type="number" min="0.01" step="0.01" required defaultValue={(coupon||bundle)?.discountValue||10}/></Field></div>}
      {kind==="collection"&&<><Field label="集合介绍"><textarea name="description" defaultValue={collection?.description||""}/></Field><Field label="显示顺序"><input name="sortOrder" type="number" min="0" step="1" defaultValue={collection?.sortOrder||0}/></Field></>}
      {kind==="recommendation"&&<><Field label="推荐策略"><select name="strategy" defaultValue={recommendation?.strategy||"manual"}><option value="manual">手动选品</option><option value="featured">精选商品</option><option value="category">相同分类</option></select></Field><Field label="关联来源商品"><select name="sourceProductId" defaultValue={recommendation?.sourceProductId||""}><option value="">全部商品页面</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="分类名称（相同分类策略使用）"><input name="category"/></Field></>}
      {(kind==="bundle"||kind==="collection"||kind==="recommendation")&&<div><h3>选择商品{kind==="recommendation"?"（仅手动策略使用）":""}</h3>{products.map(p=><label className="v6-check-field" key={p.id}><input type="checkbox" name="productIds" value={p.id} defaultChecked={selected.includes(p.id)}/>{p.name}</label>)}</div>}
      {kind==="schedule"&&<><Field label="需要排期的活动 *"><select name="target" required defaultValue={schedule?`${schedule.targetType}:${schedule.targetId}`:""}><option value="">请选择已创建的活动</option>{rows.filter(row=>row.kind!=="schedule").map(row=><option key={row.id} value={`${row.kind}:${row.id}`}>{names[row.kind]} · {row.name}</option>)}</select></Field><div className="bo-form-grid"><Field label="开始时间 *"><input name="startsAt" type="datetime-local" required defaultValue={schedule?.startsAt?.slice(0,16)}/></Field><Field label="结束时间"><input name="endsAt" type="datetime-local" defaultValue={schedule?.endsAt?.slice(0,16)}/></Field></div><p className="bo-info">排期创建后不直接改写时间。如需调整，请取消旧排期再创建。</p></>}
      {kind!=="schedule"&&<label className="v6-check-field"><input type="checkbox" name="active" defaultChecked={(coupon||bundle||collection||recommendation)?.active??true}/>启用此{names[kind]}</label>}
    </AsyncForm>{schedule&&!["expired","cancelled"].includes(schedule.status)&&canWrite&&<AsyncForm label="取消此排期" onSave={async()=>{if(!window.confirm("确认取消这个活动排期？"))return;onChange(await merchantWrite<Partial<Marketing>>(siteId,"campaigns","DELETE",{id:schedule.id}));open();}}><p>取消排期不删除活动资料。</p></AsyncForm>}</div></RecordPage>;
  }
  return <BusinessTable title="营销活动" rows={rows} rowKey={row=>row.kind+row.id} searchText={row=>`${row.name} ${names[row.kind]} ${row.summary}`} status={row=>row.status} columns={[{label:"名称",render:row=>row.name},{label:"类型",render:row=>names[row.kind]},{label:"规则",render:row=>row.summary},{label:"状态",render:row=>row.status}]} onOpen={row=>open(`edit-${row.kind}`,row.id)} actions={<label className="bo-field"><span className="sr-only">创建活动类型</span><select value="" disabled={!canWrite} onChange={event=>{if(event.target.value)open(`new-${event.target.value}`);}}><option value="">＋ 创建活动</option>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>} />;
}
