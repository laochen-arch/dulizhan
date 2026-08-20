"use client";

import { usePathname } from "next/navigation";
import SiteLink from "./site-link";

const menus = [
  { label: "产品与功能", groups: [{ heading: "开始搭建", links: [{ label: "申请入驻", href: "/platform/apply" }, { label: "模板预览", href: "/platform/templates/default" }] }, { heading: "交付流程", links: [{ label: "品牌与首页资料", href: "/platform/apply" }, { label: "商品资料导入", href: "/platform/apply" }] }, { heading: "申请管理", links: [{ label: "查看申请进度", href: "/platform/applications" }, { label: "平台协议", href: "/platform/agreement" }] }] },
  { label: "解决方案", groups: [{ heading: "按阶段选择", links: [{ label: "新品牌上线", href: "/platform/plans" }, { label: "白标独立站", href: "/platform" }, { label: "多站点交付", href: "/platform/applications" }] }, { heading: "按场景选择", links: [{ label: "户外与旅行", href: "/platform/templates/default" }, { label: "目录迁移", href: "/platform/apply" }, { label: "域名与发布", href: "/platform/applications" }] }] },
  { label: "案例与资源", groups: [{ heading: "了解平台", links: [{ label: "客户案例", href: "/platform" }, { label: "模板中心", href: "/platform/templates/default" }, { label: "入驻指南", href: "/platform/agreement" }] }, { heading: "持续支持", links: [{ label: "推荐奖励", href: "/platform/referrals" }, { label: "联系客服", href: "/platform/applications" }] }] },
] as const;

export function PlatformPortalHeader() {
  const pathname = usePathname() || "/platform";
  const isActive = (href: string) => { const cleanPath = href.split("?")[0]; return cleanPath === "/platform" ? pathname === cleanPath : pathname === cleanPath || pathname.startsWith(`${cleanPath}/`); };
  return <>
    <div className="platform-announcement">免费领取独立站 0-1 开店指南 · 从品牌资料到建站实操，轻松开启全球业务 → <SiteLink href="/platform/apply">点击领取</SiteLink></div>
    <header className="platform-portal-header"><div className="platform-portal-header-inner">
      <SiteLink href="/platform" className="platform-portal-brand"><span className="platform-portal-mark">N</span><span><strong>Northline Commerce</strong><small>Merchant platform</small></span></SiteLink>
      <nav aria-label="Platform portal navigation">{menus.map((menu) => <div className="platform-nav-menu" key={menu.label}><SiteLink href={menu.groups[0].links[0].href} className={menu.groups.some((group) => group.links.some((link) => isActive(link.href))) ? "is-active platform-nav-trigger" : "platform-nav-trigger"}>{menu.label} <span>⌄</span></SiteLink><div className="platform-nav-dropdown">{menu.groups.map((group) => <div key={group.heading}><p>{group.heading}</p>{group.links.map((link) => <SiteLink href={link.href} key={link.href + link.label}>{link.label}<span>↗</span></SiteLink>)}</div>)}</div></div>)}<SiteLink href="/platform/plans" className={isActive("/platform/plans") ? "is-active" : ""}>套餐定价</SiteLink></nav>
      <div className="platform-portal-actions"><SiteLink href="/auth/login?return_to=%2Fplatform%2Fapplications" className="platform-login-link">登录</SiteLink><SiteLink href="/platform/apply" className="platform-portal-cta">申请入驻 <span>↗</span></SiteLink></div>
    </div></header>
  </>;
}
