"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "./site-link";

type SessionPayload = {
  access?: {
    authenticated: boolean;
    user: { id: string; email: string; displayName: string } | null;
    customerRole: "customer" | null;
    merchantRole: "merchant_owner" | "merchant_manager" | "merchant_staff" | null;
    cmsRole: "owner" | "editor" | "viewer" | null;
  };
};

export function StorefrontAccessMenu() {
  const pathname = usePathname() || "/";
  const [access, setAccess] = useState<SessionPayload["access"]>();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/account/session", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as SessionPayload;
        if (active) setAccess(payload.access);
      }).catch(() => {
        if (active) setAccess(undefined);
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pathname]);

  if (!access) return <span className="access-menu access-menu-loading" aria-hidden="true" />;
  if (!access.authenticated) return <a className="access-menu-link access-menu-signin" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(pathname)}`}>Sign in</a>;

  const links = [
    access.customerRole ? { href: "/account", label: "Account", active: pathname.startsWith("/account") } : null,
    access.merchantRole ? { href: "/manage", label: "Merchant", active: pathname.startsWith("/manage") } : null,
    access.cmsRole ? { href: "/admin", label: "Studio", active: pathname.startsWith("/admin") } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; active: boolean }>;

  return <div className="access-menu" aria-label="Account and workspace access">
    {links.map((link) => <Link key={link.href} href={link.href} className={`access-menu-link ${link.active ? "is-active" : ""}`}>{link.label}</Link>)}
  </div>;
}
