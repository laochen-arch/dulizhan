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
  // The storefront is the consumer surface. Merchant and platform users have
  // their own dedicated entry URLs and workspaces, so do not mix role links
  // into the customer navigation or turn the header into a role switcher.
  // hasMerchantAccess / hasPlatformAccess are deliberately resolved by their
  // dedicated route guards instead of being rendered as extra header choices.
  return <div className="access-menu" aria-label="Customer account access">
    {hasCustomerAccess && <Link href="/account" className={"access-menu-link " + (pathname.startsWith("/account") ? "is-active" : "")}>Account</Link>}
    {hasCustomerAccess && <Link href="/orders" className={"access-menu-link " + (pathname.startsWith("/orders") ? "is-active" : "")}>Orders</Link>}
    {hasCustomerAccess && <Link href="/wishlist" className={"access-menu-link " + (pathname.startsWith("/wishlist") ? "is-active" : "")}>Saved</Link>}
    <a className="access-menu-link access-menu-signout" href={"/signout-with-chatgpt?return_to=" + encodeURIComponent(pathname || "/")}>Sign out</a>
  </div>;
}
