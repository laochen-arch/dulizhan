/**
 * White-label client configuration.
 * Replace values in this file first when onboarding a new B2B client.
 * Product catalog data lives in products.ts so the two concerns stay separate.
 */
export type HomeModule = "hero" | "intro" | "products" | "story" | "journal" | "newsletter";
export type SiteColorKey = "ink" | "muted" | "paper" | "warm" | "white" | "line" | "rust" | "sage";

export type SiteConfig = {
  client: { demoName: string; industry: string; market: string };
  brand: { name: string; mark: string; descriptor: string; tagline: string; footerLine: string; originLine: string };
  theme: {
    colors: Record<SiteColorKey, string>;
    typography: { display: string; body: string };
  };
  navigation: Array<{ label: string; href: string }>;
  announcement: { text: string; accent: string };
  assets: { hero: string; story: string; journalHero: string; aboutHero: string };
  content: {
    home: {
      modules: HomeModule[];
      heroLabel: string; heroTitleLead: string; heroTitleAccent: string; heroBody: string; heroCta: string;
      introLabel: string; introTitleLead: string; introTitleAccent: string; introBody: string;
      storyLabel: string; storyTitleLead: string; storyTitleAccent: string; storyBody: string;
      newsletterLabel: string; newsletterTitleLead: string; newsletterTitleAccent: string; newsletterBody: string;
      productsLabel: string; productsTitleLead: string; productsTitleAccent: string;
      journalLabel: string; journalTitleLead: string; journalTitleAccent: string;
    };
    about: { label: string; titleLead: string; titleAccent: string; lead: string; valuesLabel: string };
    faq: { label: string; titleLead: string; titleAccent: string; intro: string };
    contact: { email: string; tradeEmail: string; instagram: string; pinterest: string; youtube: string };
    policies: { shippingLead: string; deliveryLead: string; returnsLead: string; shippingThreshold: string };
    legal: { privacyLabel: string; termsLabel: string; accessibilityLabel: string };
  };
  seo: { title: string; description: string; keywords: string };
  tracking: { ga4MeasurementId: string; metaPixelId: string; tiktokPixelId: string };
  commerce: { currency: string; orderPrefix: string; shipping: { standard: number; express: number; freeThreshold: number } };
  b2b: { templateRole: string; replacementMode: string; handoffRule: string; localPreviewStorage: string; handoffStatus: string };
};

export const siteConfig: SiteConfig = {
  client: {
    demoName: "Northline Supply",
    industry: "Outdoor & travel goods",
    market: "US / UK / CA / AU",
  },
  brand: {
    name: "Northline Supply",
    mark: "N",
    descriptor: "Considered gear for the space between here and there.",
    tagline: "Pack lighter. Go further.",
    footerLine: "Gear for the space between here and there.",
    originLine: "Designed in the Pacific Northwest. Made for everywhere.",
  },
  theme: {
    colors: {
      ink: "#1d1f1c",
      muted: "#74756d",
      paper: "#f4f1eb",
      warm: "#e7dfd2",
      white: "#fbfaf7",
      line: "rgba(29, 31, 28, 0.16)",
      rust: "#ad4e30",
      sage: "#899080",
    },
    typography: {
      display: "editorial serif italic",
      body: "modern sans serif",
    },
  },
  navigation: [
    { label: "Shop all", href: "/shop" },
    { label: "Carry", href: "/shop?category=Carry" },
    { label: "Organize", href: "/shop?category=Organize" },
    { label: "Our story", href: "/about" },
  ],
  announcement: {
    text: "Free US shipping on orders over $100",
    accent: "Built for the long way around",
  },
  assets: {
    hero: "https://images.unsplash.com/photo-1522199710521-72d69614c702?auto=format&fit=crop&w=1800&q=88",
    story: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85",
    journalHero: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1200&q=85",
    aboutHero: "https://images.unsplash.com/photo-1464278533981-50106e6176b1?auto=format&fit=crop&w=1800&q=85",
  },
  content: {
    home: {
      modules: ["hero", "intro", "products", "story", "journal", "newsletter"],
      heroLabel: "Northline Supply / Est. 2024",
      heroTitleLead: "Pack lighter.",
      heroTitleAccent: "Go further.",
      heroBody: "Considered gear for the space between here and there. Made for early starts, open roads, and the long way around.",
      heroCta: "Explore the collection",
      introLabel: "Made for movement",
      introTitleLead: "Good gear gets",
      introTitleAccent: "out of the way.",
      introBody: "We make the things you reach for without thinking. Quietly capable, built to last, and considered down to the last stitch.",
      storyLabel: "A slower point of view",
      storyTitleLead: "Leave room for",
      storyTitleAccent: "the unexpected.",
      storyBody: "Northline started with a simple belief: the best trips are shaped by what you didn’t plan for. Our pieces are designed to keep up, without asking for attention.",
      newsletterLabel: "The Northline dispatch",
      newsletterTitleLead: "Small notes for",
      newsletterTitleAccent: "faraway places.",
      newsletterBody: "New gear, field notes, and occasional reasons to change your route.",
      productsLabel: "The essentials",
      productsTitleLead: "Take only",
      productsTitleAccent: "what matters.",
      journalLabel: "From the journal",
      journalTitleLead: "Notes for",
      journalTitleAccent: "the road ahead.",
    },
    about: {
      label: "Northline / Our story",
      titleLead: "For the part",
      titleAccent: "that comes next.",
      lead: "Northline is a small, independent gear company for people who know the best part of a journey is rarely the part you planned.",
      valuesLabel: "What we keep close",
    },
    faq: {
      label: "Good questions",
      titleLead: "We'll keep",
      titleAccent: "it simple.",
      intro: "The useful answers, without the fine-print fog.",
    },
    contact: {
      email: "hello@northlinesupply.com",
      tradeEmail: "trade@northlinesupply.com",
      instagram: "https://instagram.com",
      pinterest: "https://pinterest.com",
      youtube: "https://youtube.com",
    },
    policies: {
      shippingLead: "Orders leave our studio within 1-2 business days.",
      deliveryLead: "Standard delivery typically takes 3-5 business days after dispatch.",
      returnsLead: "Returns are accepted within 30 days of delivery when items are unused and in original condition.",
      shippingThreshold: "$100",
    },
    legal: {
      privacyLabel: "Privacy",
      termsLabel: "Terms",
      accessibilityLabel: "Accessibility",
    },
  },
  seo: {
    title: "Considered gear for the space between here and there.",
    description: "Premium travel and outdoor essentials made for early starts, open roads, and the long way around.",
    keywords: "travel gear, outdoor essentials, packing cubes, backpacks, hydration",
  },
  tracking: {
    ga4MeasurementId: "",
    metaPixelId: "",
    tiktokPixelId: "",
  },
  commerce: {
    currency: "USD",
    orderPrefix: "NL",
    shipping: {
      standard: 8,
      express: 18,
      freeThreshold: 100,
    },
  },
  b2b: {
    templateRole: "White-label independent ecommerce storefront",
    replacementMode: "Replace config, catalog, media, and legal copy per client",
    handoffRule: "New client materials should map to the replacement list before implementation.",
    localPreviewStorage: "Browser-local demo storage; connect a CMS or database for production editing.",
    handoffStatus: "Ready for client replacement",
  },
};
