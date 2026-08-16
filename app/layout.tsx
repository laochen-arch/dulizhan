import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import type { CmsSnapshot } from "../db/cms";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { SiteRuntimeProvider } from "./components/site-runtime";
import { ToastViewport } from "./components/toast";
import { siteConfig } from "./data/site-config";
import { TenantMetadata } from "./components/tenant-metadata";
import { AnalyticsTracker } from "./components/analytics-tracker";
import { TrackingScripts } from "./components/tracking-scripts";
import { WishlistProvider } from "./components/wishlist-context";
import { CartDrawer } from "./components/cart-drawer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const fallbackMetadata: Metadata = {
  title: { default: `${siteConfig.brand.name} - ${siteConfig.brand.tagline}`, template: `%s - ${siteConfig.brand.name}` },
  description: siteConfig.seo.description,
  keywords: siteConfig.seo.keywords,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: `${siteConfig.brand.name} - ${siteConfig.brand.tagline}`,
    description: siteConfig.seo.description,
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.brand.name} - ${siteConfig.brand.tagline}`,
    description: siteConfig.seo.description,
    images: ["/og.png"],
  },
};

export const dynamic = "force-dynamic";

async function getInitialPublishedSnapshot(): Promise<CmsSnapshot | null> {
  try {
    const requestHeaders = await headers();
    const { readSnapshot, resolveSiteByHost } = await import("../db/cms");
    const site = await resolveSiteByHost(requestHeaders.get("host"));
    return await readSnapshot(site.id, "published");
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const requestHeaders = await headers();
    const { readSnapshot, resolveSiteByHost } = await import("../db/cms");
    const site = await resolveSiteByHost(requestHeaders.get("host"));
    const snapshot = await readSnapshot(site.id, "published");
    const { config } = snapshot;
    return {
      title: { default: `${config.brand.name} - ${config.brand.tagline}`, template: `%s - ${config.brand.name}` },
      description: config.seo.description,
      keywords: config.seo.keywords,
      icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
      openGraph: { title: `${config.brand.name} - ${config.brand.tagline}`, description: config.seo.description, images: ["/og.png"] },
      twitter: { card: "summary_large_image", title: `${config.brand.name} - ${config.brand.tagline}`, description: config.seo.description, images: ["/og.png"] },
    };
  } catch {
    return fallbackMetadata;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeStyle = Object.fromEntries(Object.entries(siteConfig.theme.colors).map(([key, value]) => [`--${key}`, value]));
  const initialPayload = await getInitialPublishedSnapshot();
  return (
    <html lang="en">
      <body style={themeStyle as React.CSSProperties} className={`${geistSans.variable} ${geistMono.variable}`}>
        <SiteRuntimeProvider initialPayload={initialPayload}>
          <WishlistProvider>
            <TenantMetadata />
            <AnalyticsTracker />
            <TrackingScripts />
            <SiteHeader />
            <CartDrawer />
            <main>{children}</main>
            <SiteFooter />
            <ToastViewport />
          </WishlistProvider>
        </SiteRuntimeProvider>
      </body>
    </html>
  );
}
