import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { siteConfig } from "./data/site-config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`, template: `%s — ${siteConfig.brand.name}` },
  description: `${siteConfig.brand.descriptor} Premium travel and outdoor essentials from ${siteConfig.brand.name}.`,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`, description: siteConfig.brand.descriptor, images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`, description: siteConfig.brand.descriptor, images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeStyle = Object.fromEntries(Object.entries(siteConfig.theme.colors).map(([key, value]) => [`--${key}`, value]));
  return <html lang="en"><body style={themeStyle as React.CSSProperties} className={`${geistSans.variable} ${geistMono.variable}`}><SiteHeader /><main>{children}</main><SiteFooter /></body></html>;
}
