"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "./site-link";
import { loadStorefrontSession, type StorefrontAccess } from "../lib/storefront-session";

export function StorefrontAccessMenu() {
  const pathname = usePathname() || "/";
  const [access, setAccess] = useState<StorefrontAccess>();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadStorefrontSession().then((nextAccess) => { if (active) setAccess(nextAccess); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pathname]);

  if (!access) return <span className="access-menu access-menu-loading" aria-hidden="true" />;
  if (!access.authenticated) return <a className="access-menu-link access-menu-signin" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(pathname)}`}>Sign in</a>;

  const capabilities = new Set(access.capabilities || []);
  const canOpenMerchant = Boolean(access.merchantRole && (capabilities.has("merchant.read") || capabilities.has("orders.read")));
  const canOpenStudio = Boolean(access.cmsRole && (capabilities.has("cms.read") || capabilities.has("content.read") || access.cmsRole === "owner"));
  const links = [
    access.customerRole ? { href: "/account", label: "Account", active: pathname.startsWith("/account") } : null,
    canOpenMerchant ? { href: "/manage", label: "Merchant", active: pathname.startsWith("/manage") } : null,
    canOpenStudio ? { href: "/admin", label: "Studio", active: pathname.startsWith("/admin") } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

  return <div className="access-menu" aria-label="Account and workspace access">
    <span className="access-menu-user" title={access.user?.email}>{access.user?.displayName || "Account"}</span>
    {links.map((link) => <Link key={link.href} href={link.href} className={`access-menu-link ${link.active ? "is-active" : ""}`}>{link.label}</Link>)}
    <a className="access-menu-link access-menu-signout" href={`/signout-with-chatgpt?return_to=${encodeURIComponent(pathname || "/")}`}>Sign out</a>
  </div>;
}
