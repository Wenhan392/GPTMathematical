export type PaidPlanId = "plus_monthly" | "plus_yearly" | "lifetime";

export type LicensePlan = "free" | "plus_subscription" | "lifetime";

export interface CheckoutPlan {
  id: PaidPlanId;
  name: string;
  priceEnv: string;
  mode: "payment" | "subscription";
  licensePlan: LicensePlan;
  minQuantity: number;
  maxQuantity: number;
}

export const freeExportLimit = 15;

export const checkoutPlans: Record<PaidPlanId, CheckoutPlan> = {
  plus_monthly: {
    id: "plus_monthly",
    name: "Plus Monthly",
    priceEnv: "STRIPE_MONTHLY_PRICE_ID",
    mode: "subscription",
    licensePlan: "plus_subscription",
    minQuantity: 1,
    maxQuantity: 1
  },
  plus_yearly: {
    id: "plus_yearly",
    name: "Plus Yearly",
    priceEnv: "STRIPE_YEARLY_PRICE_ID",
    mode: "subscription",
    licensePlan: "plus_subscription",
    minQuantity: 1,
    maxQuantity: 1
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime Access",
    priceEnv: "STRIPE_LIFETIME_PRICE_ID",
    mode: "payment",
    licensePlan: "lifetime",
    minQuantity: 1,
    maxQuantity: 1
  }
};

export function normalizeQuantity(plan: CheckoutPlan, quantity: unknown): number {
  const parsed = typeof quantity === "number" ? quantity : Number(quantity || plan.minQuantity);
  if (!Number.isFinite(parsed)) {
    return plan.minQuantity;
  }

  return Math.min(plan.maxQuantity, Math.max(plan.minQuantity, Math.floor(parsed)));
}
