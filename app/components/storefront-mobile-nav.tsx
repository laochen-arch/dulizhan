"use client";

import { usePathname } from "next/navigation";
import Link from "./site-link";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";

const links = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/shop", label: "Shop", icon: "＋" },
  { href: "/wishlist", label: "Saved", icon: "♡" },
  { href: "/account", label: "Account", icon: "◯" },
];

export function StorefrontMobileNav() {
  const pathname = usePathname() || "/";
  const { activeSiteId, site } = useSiteRuntime();
  const { cartCount } = useStore(site?.id || activeSiteId);
  if (pathname.startsWith("/admin") || pathname.startsWith("/manage") || pathname.startsWith("/merchant") || pathname.startsWith("/platform") || pathname.startsWith("/preview")) return null;
  return <nav className="storefront-mobile-nav" aria-label="Mobile storefront navigation">
    {links.map((link) => {
      const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
      return <Link key={link.href} href={link.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
        <span className="storefront-mobile-nav-icon" aria-hidden="true">{link.icon}</span>
        <span>{link.label}</span>
      </Link>;
    })}
    <Link href="/cart" className={pathname.startsWith("/cart") || pathname.startsWith("/checkout") ? "is-active" : ""} aria-current={pathname.startsWith("/cart") || pathname.startsWith("/checkout") ? "page" : undefined}>
      <span className="storefront-mobile-nav-icon storefront-mobile-nav-bag" aria-hidden="true">⌑<b>{cartCount}</b></span>
      <span>Bag</span>
    </Link>
  </nav>;
}
