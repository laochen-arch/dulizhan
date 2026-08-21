import Link from "../components/site-link";

export const metadata = { title: "Northline Commerce | 为商户交付独立站" };

const capabilities = [
  { index: "01", label: "开始搭建", title: "快速建站", body: "从模板、品牌资料和商品清单开始，先完成一个可以预览的独立站。", href: "/platform/apply", action: "申请入驻" },
  { index: "02", label: "经营商品", title: "商品经营", body: "商户拥有自己的商品、库存、活动和订单数据，平台模板不会混入经营数据。", href: "/platform/templates/default", action: "查看模板" },
  { index: "03", label: "全球交易", title: "全球收款", body: "在上线前检查 PayPal、邮件、域名和发布状态，让支付与履约链路有迹可循。", href: "/platform/applications", action: "查看交付状态" },
  { index: "04", label: "持续增长", title: "客户增长", body: "用清晰的站点结构、内容模块和运营工具，持续优化转化和复购。", href: "/platform/plans", action: "了解套餐" },
];

const deliverySteps = [
  { index: "01", title: "提交资料", body: "填写企业或个人信息、品牌方向、经营品类和目标市场。" },
  { index: "02", title: "配置站点", body: "选择模板，补充 Logo、主色、首页文案和商品资料。" },
  { index: "03", title: "审核上线", body: "平台完成审核、站点创建、域名检查和上线验收。" },
];

const cases = [
  { label: "户外 / 旅行", title: "把可靠的商品，交付成可靠的站点。", body: "适合有明确商品目录、需要快速验证海外市场的品牌。" },
  { label: "生活方式", title: "统一品牌表达，独立经营每一笔订单。", body: "适合需要内容、商品和活动一起运营的商户团队。" },
  { label: "限量发售", title: "从一份清单，快速进入一次发布。", body: "适合创作者、联名项目和小批量新品发布。" },
];

const plans = [
  { name: "基础版", desc: "适合刚开始验证市场的品牌", price: "$22.40", note: "按年计费" },
  { name: "旗舰版", desc: "适合已经稳定出单的商家", price: "$79.20", note: "最受欢迎" },
  { name: "PRO 版", desc: "适合品牌化运营和团队协作", price: "$174.40", note: "适合规模化运营" },
];

export default function PlatformPortalPage() {
  return <main className="platform-portal platform-portal-home-v2">
    <section className="platform-v2-hero">
      <div className="platform-v2-hero-copy">
        <p className="platform-v2-eyebrow">NORTHLINE COMMERCE / 独立站交付平台</p>
        <h1>把品牌，带到全球。</h1>
        <p className="platform-v2-hero-lead">从申请入驻、站点配置，到商品经营和订单履约，为商户提供一条清晰、可复用的独立站成长路径。</p>
        <div className="platform-v2-actions"><Link aria-label="Apply to join / 申请入驻" className="platform-v2-primary" href="/platform/apply">免费试用 / 申请入驻 <span>↗</span></Link><Link className="platform-v2-secondary" href="/platform/templates/default">先看看模板 <span>↗</span></Link></div>
        <div className="platform-v2-proof"><span><strong>01</strong><small>提交入驻资料</small></span><span><strong>02</strong><small>完成站点配置</small></span><span><strong>03</strong><small>开始商品经营</small></span></div>
      </div>
      <div className="platform-v2-dashboard" aria-label="Merchant workspace preview">
        <div className="platform-v2-dashboard-top"><span>商户工作台</span><span className="platform-v2-dashboard-dot">● 已连接</span></div>
        <div className="platform-v2-dashboard-body"><aside><span className="is-active">⌂　首页</span><span>▣　订单</span><span>◆　商品</span><span>◌　营销</span><span>▥　数据</span></aside><div><div className="platform-v2-dashboard-heading"><div><small>今日经营概览</small><strong>把重要的工作，放在一起。</strong></div><span>最近 30 天⌄</span></div><div className="platform-v2-dashboard-metrics"><div><small>已支付订单</small><strong>128</strong><span>↗ 12.8%</span></div><div><small>商品数量</small><strong>36</strong><span>已上架 31</span></div><div><small>待处理事项</small><strong>08</strong><span>需要关注</span></div></div><div className="platform-v2-dashboard-list"><div><span>商品目录</span><b>更新 3 个商品</b><i>→</i></div><div><span>上线检查</span><b>已完成 8 / 10 项</b><i>→</i></div><div><span>订单履约</span><b>2 个订单待发货</b><i>→</i></div></div></div></div>
      </div>
    </section>

    <section className="platform-v2-capabilities"><div className="platform-v2-section-heading"><p className="platform-v2-eyebrow">一个平台，四个关键能力</p><h2>为商户交付而设计。</h2><p>平台方负责规则、模板和交付；商户负责商品、活动、订单和客户。每个入口只显示当前角色需要完成的工作。</p></div><div className="platform-v2-capability-grid">{capabilities.map((item) => <Link href={item.href} className="platform-v2-capability" key={item.index}><span className="platform-v2-number">{item.index}</span><span className="platform-v2-capability-label">{item.label}</span><strong>{item.title}</strong><p>{item.body}</p><span className="platform-v2-link">{item.action} <b>↗</b></span></Link>)}</div></section>

    <section className="platform-v2-delivery"><div className="platform-v2-section-heading"><p className="platform-v2-eyebrow">从资料到上线</p><h2>每一步，都看得懂。</h2><p>申请人可以查看进度，商户可以进入工作台，平台方可以追踪审核与发布状态。</p><Link href="/platform/applications" className="platform-v2-text-link">查看我的申请 <span>↗</span></Link></div><div className="platform-v2-step-list">{deliverySteps.map((step) => <div key={step.index}><span>{step.index}</span><div><strong>{step.title}</strong><p>{step.body}</p></div><b>→</b></div>)}</div></section>

    <section className="platform-v2-cases" aria-label="Customer cases / examples"><div className="platform-v2-section-heading"><p className="platform-v2-eyebrow">客户案例 / 适用场景</p><h2>从不同的生意，<br /><em>开始同一条路径。</em></h2><p>先用可替换的模板和内容完成验证，再根据真实经营数据持续迭代。</p></div><div className="platform-v2-case-grid">{cases.map((item, index) => <article key={item.label}><span>0{index + 1}</span><small>{item.label}</small><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>

    <section className="platform-v2-pricing"><div><p className="platform-v2-eyebrow">套餐定价</p><h2>从合适的规模开始。</h2><p>选择适合当前阶段的服务，后续可以继续升级站点、团队和运营能力。</p></div><div className="platform-v2-plan-grid">{plans.map((plan, index) => <article className={index === 1 ? "is-featured" : ""} key={plan.name}><span>{plan.note}</span><h3>{plan.name}</h3><p>{plan.desc}</p><strong>{plan.price}<small> USD / 月</small></strong><Link href={`/platform/apply?plan=${index === 0 ? "starter" : index === 1 ? "growth" : "pro"}`}>免费试用 <b>↗</b></Link></article>)}</div><Link href="/platform/plans" className="platform-v2-pricing-more">查看完整套餐和服务费说明 <span>↗</span></Link></section>

    <section className="platform-v2-cta" aria-label="Public template preview"><p className="platform-v2-eyebrow">开始你的独立站</p><h2>带着一份资料，<br /><em>走完第一步。</em></h2><p>提交品牌、商品和目标市场信息，我们会在同一个工作区里完成站点交付。</p><div className="platform-v2-actions"><Link className="platform-v2-primary" href="/platform/apply">申请入驻 <span>↗</span></Link><Link className="platform-v2-secondary" href="/platform/templates/default">公开预览模板</Link></div></section>
  </main>;
}
