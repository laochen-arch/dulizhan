/**
 * White-label client configuration.
 * Replace values in this file first when onboarding a new B2B client.
 * Product catalog data lives in products.ts so the two concerns stay separate.
 */
export const siteConfig = {
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
  assets: {
    hero: "https://images.unsplash.com/photo-1522199710521-72d69614c702?auto=format&fit=crop&w=1800&q=88",
    story: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=85",
    journalHero: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1200&q=85",
    aboutHero: "https://images.unsplash.com/photo-1464278533981-50106e6176b1?auto=format&fit=crop&w=1800&q=85",
  },
  content: {
    home: {
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
    },
    about: {
      label: "Northline / Our story",
      titleLead: "For the part",
      titleAccent: "that comes next.",
      lead: "Northline is a small, independent gear company for people who know the best part of a journey is rarely the part you planned.",
      valuesLabel: "What we keep close",
    },
    contact: {
      email: "hello@northlinesupply.com",
      tradeEmail: "trade@northlinesupply.com",
      instagram: "https://instagram.com",
      pinterest: "https://pinterest.com",
      youtube: "https://youtube.com",
    },
  },
  b2b: {
    templateRole: "White-label independent ecommerce storefront",
    replacementMode: "Replace config, catalog, media, and legal copy per client",
    handoffRule: "New client materials should map to the replacement list before implementation.",
  },
} as const;

export type SiteConfig = typeof siteConfig;
