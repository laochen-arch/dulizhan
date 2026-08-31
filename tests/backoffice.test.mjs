import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync,existsSync} from "node:fs";
import {createRequire,Module} from "node:module";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

const root=fileURLToPath(new URL("../",import.meta.url));
// Execute real source against explicit test doubles; never contact D1, R2, PayPal or Resend.
function load(file,mocks={},cache=new Map()){
  const path=resolve(root,file);
  if(cache.has(path))return cache.get(path).exports;
  const output=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mod=new Module(path);cache.set(path,mod);mod.filename=path;const require=createRequire(path);
  mod.require=specifier=>{
    if(Object.hasOwn(mocks,specifier))return mocks[specifier];
    if(specifier.startsWith(".")){
      const base=resolve(dirname(path),specifier);
      const found=[base+".ts",base+".tsx",base+"/index.ts",base+"/index.tsx"].find(existsSync);
      if(found)return load(found,mocks,cache);
    }
    return require(specifier);
  };
  mod._compile(output,path);return mod.exports;
}
const controls=load("app/components/backoffice.tsx");
const html=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const viewMock=(view,record="")=>({...controls,useBusinessView:()=>({view,record,open(){}})});
const apiMocks={merchantWrite:async()=>{throw new Error("Unexpected write in render");},workspaceRequest:async()=>{throw new Error("Unexpected fetch in render");},productStatus:s=>s,memberRoleLabel:s=>s,fulfillmentLabel:s=>s,paymentLabel:s=>s};

test("role shell renders only its menu, accessible nested groups, and no fake counters",()=>{
  const page=html(controls.BackofficeShell,{workspaceRole:"merchant",brand:"Test merchant",title:"商品管理",description:"",current:"products",groups:[{label:"商品",items:[{id:"products",label:"商品管理"},{id:"inventory",label:"库存管理"}]}],onNavigate(){},children:"Business content"});
  assert.match(page,/backoffice-merchant/);assert.match(page,/aria-expanded="true"/);assert.match(page,/aria-current="page"/);assert.match(page,/bo-breadcrumb/);
  assert.doesNotMatch(page,/运营后台|商户申请|<b>12<\/b>/);
});

test("business tables paginate records, apply selected customer filters and show empty results",()=>{
  const rows=Array.from({length:13},(_,i)=>({id:String(i),email:i===12?"target@example.test":"other@example.test",name:"Record "+i}));
  const props={title:"订单",rows,rowKey:r=>r.id,searchText:r=>r.email,columns:[{label:"订单名称",render:r=>r.name}]};
  assert.match(html(controls.BusinessTable,props),/共 13 条/);
  assert.doesNotMatch(html(controls.BusinessTable,props),/>Record 12</);
  const filtered=html(controls.BusinessTable,{...props,initialQuery:"target@"});
  assert.match(filtered,/>Record 12</);assert.doesNotMatch(filtered,/>Record 0</);
  assert.match(html(controls.BusinessTable,{...props,initialQuery:"no-match"}),/没有符合条件的记录/);
  assert.match(html(controls.BusinessTable,{...props,rows:[]}),/暂无记录/);
});

test("create screens have business-specific fields rather than a reused product form",()=>{
  const catalog=load("app/merchant/catalog-panel.tsx",{"../components/backoffice":viewMock("new"),"./workspace-api":apiMocks});
  const product=html(catalog.MerchantCatalog,{siteId:"tenant-a",products:[],assets:[],canWrite:true,onProducts(){},onExport(){}});
  assert.match(product,/name="sku"/);assert.match(product,/name="price"/);assert.match(product,/初始库存/);
  const services=load("app/merchant/service-panels.tsx",{"../components/backoffice":viewMock("new"),"./workspace-api":apiMocks});
  const team=html(services.MerchantTeam,{siteId:"tenant-a",members:[],canWrite:true,onMembers(){}});
  assert.match(team,/name="email"/);assert.match(team,/name="role"/);assert.doesNotMatch(team,/name="price"|name="sku"/);
  const afterSales=html(services.MerchantAfterSales,{siteId:"tenant-a",requests:[],canWrite:true,onRequests(){}});
  assert.match(afterSales,/name="orderNumber"/);assert.match(afterSales,/name="reason"/);assert.doesNotMatch(afterSales,/name="sku"/);
  const marketing=load("app/merchant/marketing-panel.tsx",{"../components/backoffice":viewMock("new-coupon"),"./workspace-api":apiMocks});
  const coupon=html(marketing.MerchantMarketing,{siteId:"tenant-a",products:[],canWrite:true,data:{coupons:[],bundles:[],collections:[],recommendations:[],schedules:[]},onChange(){}});
  assert.match(coupon,/name="code"/);assert.match(coupon,/name="discountValue"/);assert.doesNotMatch(coupon,/name="sku"|name="stock"/);
});

test("missing record and read-only access do not silently select the first record",()=>{
  const services=load("app/merchant/service-panels.tsx",{"../components/backoffice":viewMock("edit","missing"),"./workspace-api":apiMocks});
  const page=html(services.MerchantTeam,{siteId:"tenant-a",members:[{userId:"other",email:"other@example.test",role:"merchant_staff",createdAt:"2026-08-31"}],canWrite:true,onMembers(){}});
  assert.match(page,/成员不存在/);assert.doesNotMatch(page,/value="other@example.test"/);
  const marketing=load("app/merchant/marketing-panel.tsx",{"../components/backoffice":viewMock("new-coupon"),"./workspace-api":apiMocks});
  const readonly=html(marketing.MerchantMarketing,{siteId:"tenant-a",products:[],canWrite:false,data:{coupons:[],bundles:[],collections:[],recommendations:[],schedules:[]},onChange(){}});
  assert.match(readonly,/<fieldset disabled=""/);assert.match(readonly,/<button[^>]+disabled=""/);
});

function request(path,body,method="POST"){return new Request("https://example.test"+path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
const access={site:{id:"tenant-a"},user:{userId:"operator",email:"operator@example.test"},member:{role:"merchant_manager"}};
const errors=error=>Response.json({error:error.message},{status:error.message==="FORBIDDEN"?403:400});

test("product patch requires actual productId and uses authenticated tenant scope",async()=>{
  const calls=[];const route=load("app/api/merchant/products/route.ts",{"../../../../db/v23":{updateClientProduct:async(...args)=>{calls.push(args);return {id:args[1],name:args[2].name};}},"../helpers":{requireMerchantCapability:async(_r,capability)=>{assert.equal(capability,"products.write");return access;},merchantErrorResponse:errors}});
  const missing=await route.PATCH(request("/api/merchant/products",{siteId:"tenant-a",id:"product-x"},"PATCH"));assert.equal(missing.status,400);assert.equal(calls.length,0);
  const saved=await route.PATCH(request("/api/merchant/products",{siteId:"tenant-a",productId:"product-x",name:"Updated"},"PATCH"));assert.equal(saved.status,200);assert.equal(calls[0][0],"tenant-a");assert.equal(calls[0][1],"product-x");
});

test("refund endpoint checks capability, validates inputs, preserves pending result and never auto-restocks",async()=>{
  const calls=[];let forbidden=false;const route=load("app/api/merchant/refunds/route.ts",{"../../../../db/commerce":{createRefund:async(...args)=>{calls.push(args);return {refunds:[{status:"pending"}],order:{paymentStatus:"paid",refundTotal:0}};}},"../helpers":{requireMerchantCapability:async(_r,capability)=>{assert.equal(capability,"orders.refund");if(forbidden)throw new Error("FORBIDDEN");return access;},merchantErrorResponse:errors}});
  for(const amount of [0,-1,"20"]){assert.equal((await route.POST(request("/api/merchant/refunds",{orderId:"order-a",amount,reason:"test"}))).status,400);}
  assert.equal(calls.length,0);
  const result=await route.POST(request("/api/merchant/refunds",{siteId:"tenant-a",orderId:"order-a",amount:20,reason:"return"}));assert.equal(result.status,200);
  assert.equal((await result.json()).refundTotal,0);assert.deepEqual(calls[0].slice(0,5),["tenant-a","order-a",20,"return",[]]);
  forbidden=true;assert.equal((await route.POST(request("/api/merchant/refunds",{orderId:"order-a",amount:20,reason:"test"}))).status,403);assert.equal(calls.length,1);
});

test("shipping update leaves notes untouched; note update leaves shipping untouched",async()=>{
  const shipments=[],notes=[];const route=load("app/api/merchant/orders/route.ts",{"../../../../db/cms":{},"../../../../db/v24":{},"../../../../db/v23":{},"../../../../db/commerce":{updateOrderFulfillment:async(...args)=>shipments.push(args),updateOrderAdminNote:async(...args)=>notes.push(args),getOrder:async()=>({order:{id:"order-a"}})},"../helpers":{requireMerchantCapability:async()=>access,merchantErrorResponse:errors}});
  assert.equal((await route.PATCH(request("/api/merchant/orders",{orderId:"order-a",fulfillmentStatus:"shipped",trackingNumber:"TRACK-1"},"PATCH"))).status,200);
  assert.equal(shipments.length,1);assert.equal(notes.length,0);
  assert.equal((await route.PATCH(request("/api/merchant/orders",{orderId:"order-a",adminNote:"Internal note"},"PATCH"))).status,200);
  assert.equal(notes.length,1);assert.equal(shipments.length,1);
});

test("domain conflict cannot transfer hostname ownership; duplicate same-site binding retains verification",async()=>{
  let saved={id:"existing",siteId:"tenant-b",hostname:"shop.example.test",status:"verified",verificationToken:"existing-token"},updates=0;
  const database={prepare(sql){assert.doesNotMatch(sql,/site_id = excluded.site_id/);return {bind(){return this;},async run(){if(sql.startsWith("UPDATE cms_sites"))updates++;return{};},async first(){return saved;}};}};
  const route=load("app/api/cms/domains/route.ts",{"../../../../db/cms":{getCmsDatabase:()=>database,ensureCmsSchema:async()=>{},normalizeDomain:value=>value},"../helpers":{requireMember:async()=>({member:{role:"owner"}}),getSiteId:()=>access.site.id,errorResponse:errors}});
  assert.equal((await route.POST(request("/api/cms/domains",{siteId:"tenant-a",hostname:"shop.example.test"}))).status,409);assert.equal(updates,0);
  saved={...saved,siteId:"tenant-a"};const response=await route.POST(request("/api/cms/domains",{siteId:"tenant-a",hostname:"shop.example.test"}));assert.equal(response.status,200);assert.equal((await response.json()).domain.status,"verified");assert.equal(updates,1);
});

test("merchant upload validates type and permission before storage and returns tenant-bound asset",async()=>{
  const puts=[];const route=load("app/api/merchant/assets/route.ts",{"../../../../db/cms":{getMediaBucket:()=>({put:async(...args)=>puts.push(args),delete:async()=>{}}),insertAsset:async asset=>asset,listAssets:async()=>[]},"../helpers":{requireMerchantCapability:async(_r,capability,site)=>{assert.equal(capability,"products.write");assert.equal(site,"tenant-a");return access;},merchantErrorResponse:errors}});
  const form=new FormData();form.set("siteId","tenant-a");form.set("file",new File(["invalid"],"file.txt",{type:"text/plain"}));
  assert.equal((await route.POST(new Request("https://example.test/api/merchant/assets",{method:"POST",body:form}))).status,400);assert.equal(puts.length,0);
  form.set("file",new File([new Uint8Array([137,80,78,71])],"test.png",{type:"image/png"}));
  const response=await route.POST(new Request("https://example.test/api/merchant/assets",{method:"POST",body:form}));assert.equal(response.status,201);assert.match(puts[0][0],/^sites\/tenant-a\/assets\//);assert.equal((await response.json()).asset.siteId,"tenant-a");
});
