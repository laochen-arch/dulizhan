"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { label: "产品与功能", groups: [{ heading: "开始搭建", links: [{ label: "申请入驻", href: "/platform/apply" }, { label: "模板预览", href: "/platform/templates/default" }] }, { heading: "交付与运营", links: [{ label: "品牌与首页配置", href: "/platform/apply" }, { label: "商品资料导入", href: "/platform/applications" }] }, { heading: "上线支持", links: [{ label: "申请进度", href: "/platform/applications" }, { label: "平台协议", href: "/platform/agreement" }] }] },
  { label: "解决方案", groups: [{ heading: "按阶段选择", links: [{ label: "新品牌上线", href: "/platform/plans" }, { label: "白标独立站", href: "/platform" }, { label: "多站点交付", href: "/platform/applications" }] }, { heading: "按场景选择", links: [{ label: "户外与旅行", href: "/platform/templates/default" }, { label: "商品目录迁移", href: "/platform/apply" }, { label: "域名与发布", href: "/platform/applications" }] }] },
  { label: "资源中心", groups: [{ heading: "自助资源", links: [{ label: "模板中心", href: "/platform/templates/default" }, { label: "入驻指南", href: "/platform/agreement" }, { label: "推荐奖励", href: "/platform/referrals" }] }, { heading: "持续支持", links: [{ label: "申请工作区", href: "/platform/applications" }, { label: "联系客服", href: "/platform/applications" }] }] },
] as const;

export function PlatformPortalHeader() {
  const pathname = usePathname() || "/platform";
  const isActive = (href: string) => { const cleanPath = href.split("?")[0]; return cleanPath === "/platform" ? pathname === cleanPath : pathname === cleanPath || pathname.startsWith(`${cleanPath}/`); };
  return <>
    <div className="platform-announcement">免费领取独立站 0-1 开店指南 · 从品牌资料到建站实操，轻松开启全球业务 → <Link href="/platform/apply">点击领取</Link></div>
    <header className="platform-portal-header"><div className="platform-portal-header-inner">
      <Link href="/platform" className="platform-portal-brand"><span className="platform-portal-mark">N</span><span><strong>Northline Commerce</strong><small>Merchant platform</small></span></Link>
      <nav aria-label="Platform portal navigation">{menus.map((menu) => <div className="platform-nav-menu" key={menu.label}><Link href={menu.groups[0].links[0].href} className={menu.groups.some((group) => group.links.some((link) => isActive(link.href))) ? "is-active platform-nav-trigger" : "platform-nav-trigger"}>{menu.label} <span>⌄</span></Link><div className="platform-nav-dropdown">{menu.groups.map((group) => <div key={group.heading}><p>{group.heading}</p>{group.links.map((link) => <Link href={link.href} key={link.href + link.label}>{link.label}<span>↗</span></Link>)}</div>)}</div></div>)}<Link href="/platform/plans" className={isActive("/platform/plans") ? "is-active" : ""}>套餐定价</Link></nav>
      <div className="platform-portal-actions"><Link href="/auth/login?return_to=%2Fplatform" className="platform-login-link">登录</Link><Link href="/auth/register?return_to=%2Fplatform" className="platform-login-link">注册</Link><Link href="/platform/apply" className="platform-portal-cta">免费试用 <span>↗</span></Link></div>
    </div></header>
  </>;
}
