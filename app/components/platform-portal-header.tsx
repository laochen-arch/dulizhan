"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/platform", label: "平台首页" },
  { href: "/platform/apply", label: "申请入驻" },
  { href: "/platform/applications", label: "申请进度" },
];

export function PlatformPortalHeader() {
  const pathname = usePathname() || "/platform";

  return (
    <header className="platform-portal-header">
      <div className="platform-portal-header-inner">
        <Link href="/platform" className="platform-portal-brand">
          <span className="platform-portal-mark">N</span>
          <span><strong>Northline Commerce</strong><small>Merchant platform</small></span>
        </Link>
        <nav aria-label="Platform portal navigation">
          {links.map((link) => {
            const active = link.href === "/platform" ? pathname === "/platform" : pathname.startsWith(link.href);
            return <Link key={link.href} href={link.href} className={active ? "is-active" : ""}>{link.label}</Link>;
          })}
        </nav>
        <Link href="/platform/apply" className="platform-portal-cta">开始配置 <span>↗</span></Link>
      </div>
    </header>
  );
}
