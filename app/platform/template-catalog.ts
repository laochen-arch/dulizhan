import type { SiteConfig } from "../data/site-config";

export type PlatformTemplate = {
  id: string;
  name: string;
  shortName: string;
  industry: string;
  description: string;
  sourceSiteId: string;
  previewPath: string;
  accentColor: string;
  heroLabel: string;
  heroTitleLead: string;
  heroTitleAccent: string;
  heroBody: string;
};

/**
 * Public templates are product-level variants. They all start from the
 * approved default storefront snapshot, then apply a deterministic variant
 * layer when a new merchant site is created. This keeps template delivery
 * reproducible without treating one merchant's catalog as a shared source.
 */
export const platformTemplates: PlatformTemplate[] = [
  {
    id: "default",
    name: "Northline Commerce / Outdoor",
    shortName: "Outdoor",
    industry: "Outdoor & travel goods",
    description: "Editorial commerce for field gear, travel essentials and considered everyday carry.",
    sourceSiteId: "default",
    previewPath: "/platform/templates/default?template=default",
    accentColor: "#ad4e30",
    heroLabel: "Outdoor goods / Built for the long way",
    heroTitleLead: "Pack lighter.",
    heroTitleAccent: "Go further.",
    heroBody: "A focused storefront for capable gear, clear product stories and the next trip on the calendar.",
  },
  {
    id: "studio",
    name: "Northline Commerce / Studio",
    shortName: "Studio",
    industry: "Lifestyle & independent brands",
    description: "A warmer editorial system for design-led collections, creator brands and limited releases.",
    sourceSiteId: "default",
    previewPath: "/platform/templates/default?template=studio",
    accentColor: "#6a4d8f",
    heroLabel: "Independent goods / Made with intent",
    heroTitleLead: "Make space for",
    heroTitleAccent: "the good stuff.",
    heroBody: "A flexible launch system for small collections, strong point of view and products people keep close.",
  },
  {
    id: "essentials",
    name: "Northline Commerce / Essentials",
    shortName: "Essentials",
    industry: "Everyday products & home",
    description: "A practical, conversion-first storefront for repeatable products and everyday routines.",
    sourceSiteId: "default",
    previewPath: "/platform/templates/default?template=essentials",
    accentColor: "#2d6f73",
    heroLabel: "Everyday essentials / Made to be used",
    heroTitleLead: "Keep what",
    heroTitleAccent: "works.",
    heroBody: "A calm, useful storefront for reliable products, simple choices and customers who come back.",
  },
];

export function getPlatformTemplate(templateId: string | null | undefined) {
  return platformTemplates.find((template) => template.id === templateId) || null;
}

export function applyPlatformTemplateVariant(config: SiteConfig, templateId: string): SiteConfig {
  const template = getPlatformTemplate(templateId);
  if (!template) return config;

  const next = JSON.parse(JSON.stringify(config)) as SiteConfig;
  next.client.industry = template.industry;
  next.brand.descriptor = template.description;
  next.brand.tagline = template.heroTitleAccent;
  next.theme.colors = {
    ...next.theme.colors,
    rust: template.accentColor,
  };
  next.content.home.heroLabel = template.heroLabel;
  next.content.home.heroTitleLead = template.heroTitleLead;
  next.content.home.heroTitleAccent = template.heroTitleAccent;
  next.content.home.heroBody = template.heroBody;
  next.content.home.heroCta = "Explore the collection";
  next.seo.description = template.description;
  next.seo.keywords = `${template.industry.toLowerCase()}, independent ecommerce, white-label storefront`;
  return next;
}
