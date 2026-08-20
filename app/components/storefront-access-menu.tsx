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
  const hasCustomerAccess = Boolean(access.customerRole || capabilities.has("customer.read"));
  const hasMerchantAccess = Boolean(access.merchantRole || capabilities.has("merchant.read"));
  const hasPlatformAccess = Boolean(access.cmsRole);

  return <div className="access-menu" aria-label="Consumer account access">
    {hasCustomerAccess && <Link href="/account" className={"access-menu-link " + (pathname.startsWith("/account") ? "is-active" : "")}>Account</Link>}
    {hasCustomerAccess && <Link href="/orders" className={"access-menu-link " + (pathname.startsWith("/orders") ? "is-active" : "")}>Orders</Link>}
    {hasCustomerAccess && <Link href="/wishlist" className={"access-menu-link " + (pathname.startsWith("/wishlist") ? "is-active" : "")}>Saved</Link>}
    {hasMerchantAccess && <Link href="/merchant" className={"access-menu-link access-menu-workspace " + (pathname.startsWith("/merchant") ? "is-active" : "")}>Merchant workspace</Link>}
    {hasPlatformAccess && <Link href="/admin" className={"access-menu-link access-menu-workspace " + (pathname.startsWith("/admin") ? "is-active" : "")}>Platform admin</Link>}
    <a className="access-menu-link access-menu-signout" href={"/signout-with-chatgpt?return_to=" + encodeURIComponent(pathname || "/")}>Sign out</a>
  </div>;
}
