"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { ToastViewport } from "./toast";
import { TenantMetadata } from "./tenant-metadata";
import { AnalyticsTracker } from "./analytics-tracker";
import { TrackingScripts } from "./tracking-scripts";
import { CartDrawer } from "./cart-drawer";
import { ConsentBanner } from "./consent-banner";
import { StorefrontMobileNav } from "./storefront-mobile-nav";
import { CartAccountSync } from "./cart-account-sync";
import { StorefrontTrustBar } from "./storefront-trust-bar";
import { PlatformPortalHeader } from "./platform-portal-header";

const internalRoutes = ["/platform", "/merchant", "/manage", "/client", "/admin", "/preview", "/invite"];

function isInternalRoute(pathname: string) {
  return internalRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isStorefront = !isInternalRoute(pathname);
  const isPlatformPortal = pathname === "/platform" || pathname.startsWith("/platform/");
  const routeClass = isStorefront ? "route-storefront" : isPlatformPortal ? "route-platform" : "route-workspace";

  return (
    <>
      <CartAccountSync />
      <TenantMetadata />
      <AnalyticsTracker />
      <TrackingScripts />
      {isStorefront ? <SiteHeader /> : isPlatformPortal ? <PlatformPortalHeader /> : null}
      {isStorefront && <CartDrawer />}
      <main className={["app-route", routeClass].join(" ")}>{children}</main>
      {isStorefront && <StorefrontTrustBar />}
      {isStorefront && <StorefrontMobileNav />}
      {isStorefront && <SiteFooter />}
      <ToastViewport />
      {isStorefront && <ConsentBanner />}
    </>
  );
}
