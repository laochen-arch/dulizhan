export type Product = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: "Carry" | "Hydration" | "Organize";
  price: number;
  compareAt?: number;
  description: string;
  details: string;
  image: string;
  alt: string;
  badge?: string;
  colors: string[];
  specs: string[];
};

export const products: Product[] = [
  {
    id: "northline-01",
    slug: "field-pack-28l",
    name: "Field Pack 28L",
    shortName: "Field Pack",
    category: "Carry",
    price: 168,
    description: "A calm, capable carry for the in-between miles.",
    details:
      "Built for one-bag weekends and long days out, the Field Pack keeps your kit close, protected, and easy to reach.",
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85",
    alt: "Black travel backpack resting on a rock",
    badge: "Best seller",
    colors: ["Obsidian", "Moss"],
    specs: ["28L carry capacity", "Recycled ripstop nylon", "Padded 16-inch laptop sleeve"],
  },
  {
    id: "northline-02",
    slug: "trail-bottle-750",
    name: "Trail Bottle 750",
    shortName: "Trail Bottle",
    category: "Hydration",
    price: 42,
    description: "Cold water, wherever the road turns.",
    details:
      "A double-wall stainless steel bottle with a soft-touch finish and a lid made to clip onto your everyday carry.",
    image:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=85",
    alt: "Stainless steel water bottle on a dark surface",
    badge: "New",
    colors: ["Steel", "Sand", "Pine"],
    specs: ["750ml capacity", "24-hour cold retention", "BPA-free stainless steel"],
  },
  {
    id: "northline-03",
    slug: "modular-cube-set",
    name: "Modular Cube Set",
    shortName: "Modular Cubes",
    category: "Organize",
    price: 76,
    compareAt: 88,
    description: "A better place for every layer.",
    details:
      "Three structured packing cubes in breathable recycled nylon, sized to make a week away feel surprisingly simple.",
    image:
      "https://images.unsplash.com/photo-1553531889-56a7c7d0f4d8?auto=format&fit=crop&w=1200&q=85",
    alt: "Neutral travel packing cubes arranged together",
    badge: "Set of 3",
    colors: ["Sand", "Slate"],
    specs: ["Set of 3 nesting cubes", "YKK reverse-coil zippers", "Lightweight recycled nylon"],
  },
  {
    id: "northline-04",
    slug: "summit-sling",
    name: "Summit Sling",
    shortName: "Summit Sling",
    category: "Carry",
    price: 88,
    description: "The essentials, carried with intention.",
    details:
      "A compact crossbody for passports, keys, and the small things that keep your day moving.",
    image:
      "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=1200&q=85",
    alt: "Minimal black sling bag on a neutral background",
    colors: ["Obsidian", "Clay"],
    specs: ["3L daily capacity", "Weather-resistant shell", "Adjustable quick-release strap"],
  },
  {
    id: "northline-05",
    slug: "camp-cup-duo",
    name: "Camp Cup Duo",
    shortName: "Camp Cups",
    category: "Hydration",
    price: 38,
    description: "Slow mornings deserve good hardware.",
    details:
      "A pair of nesting titanium cups for camp coffee, trail tea, and the ritual that starts the day.",
    image:
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85",
    alt: "Coffee cup outdoors beside a camp setting",
    colors: ["Titanium"],
    specs: ["Set of 2 nesting cups", "Ultralight titanium", "Fold-flat handles"],
  },
  {
    id: "northline-06",
    slug: "route-wallet",
    name: "Route Wallet",
    shortName: "Route Wallet",
    category: "Organize",
    price: 54,
    description: "The small detail that keeps you moving.",
    details:
      "A slim travel wallet with a dedicated passport sleeve, hidden cash pocket, and room for the cards you actually use.",
    image:
      "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=85",
    alt: "Minimal leather wallet held in hand",
    colors: ["Walnut", "Black"],
    specs: ["Passport-ready profile", "RFID-shielded card sleeve", "Vegetable-tanned leather"],
  },
];

export const getProduct = (slug: string) => products.find((product) => product.slug === slug);

