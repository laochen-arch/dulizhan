export type PlatformPlan = {
  id: string;
  name: string;
  description: string;
  currency: string;
  setupFee: number;
  monthlyFee: number;
  annualFee: number;
  serviceFeePercent: number;
  referralReward: number;
  features: string[];
};

/**
 * Starter catalog for the platform portal. Prices are deliberately kept in
 * one pure module so the public pricing page and the server-side billing
 * ledger use the same snapshot. Platform operators can replace these values
 * when commercial pricing is finalized.
 */
export const platformPlans: PlatformPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "A focused storefront launch for a small catalog.",
    currency: "USD",
    setupFee: 299,
    monthlyFee: 79,
    annualFee: 790,
    serviceFeePercent: 2.5,
    referralReward: 100,
    features: ["Up to 50 products", "Template storefront", "Launch checklist", "Email support"],
  },
  {
    id: "growth",
    name: "Growth",
    description: "More catalog room and operating support for a growing brand.",
    currency: "USD",
    setupFee: 599,
    monthlyFee: 149,
    annualFee: 1490,
    serviceFeePercent: 1.5,
    referralReward: 150,
    features: ["Up to 250 products", "Custom domain workflow", "Catalog import support", "Priority support"],
  },
  {
    id: "scale",
    name: "Scale",
    description: "A managed delivery track for a larger white-label operation.",
    currency: "USD",
    setupFee: 999,
    monthlyFee: 299,
    annualFee: 2990,
    serviceFeePercent: 0.8,
    referralReward: 250,
    features: ["Unlimited products", "Advanced delivery support", "Migration assistance", "Dedicated launch review"],
  },
];

export function getPlatformPlan(id: string) {
  return platformPlans.find((plan) => plan.id === id) || null;
}

export function formatPlanMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
