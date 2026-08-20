import type Stripe from "stripe";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { checkoutPlans, type LicensePlan, type PaidPlanId } from "./plans";
import { generateLicenseKey } from "./licenseKeys";

export type LicenseStatus = "active" | "expired" | "revoked";

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export function licenseStatusFromSubscription(status: string | null | undefined): LicenseStatus {
  return status === "active" || status === "trialing" ? "active" : "expired";
}

export async function upsertStripeCustomer(input: {
  stripeCustomerId: string;
  email: string;
  userId?: string | null;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from("stripe_customers")
    .upsert({
      stripe_customer_id: input.stripeCustomerId,
      customer_email: normalizeEmail(input.email),
      user_id: input.userId || null
    }, { onConflict: "stripe_customer_id" });
}

export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const planId = session.metadata?.plan as PaidPlanId | undefined;
  const plan = planId ? checkoutPlans[planId] : undefined;
  const customerId = typeof session.customer === "string" ? session.customer : undefined;
  const email = normalizeEmail(session.customer_details?.email || session.customer_email);

  if (!plan || !customerId || !email) {
    throw new Error("Checkout session is missing plan, customer, or email.");
  }

  await upsertStripeCustomer({ stripeCustomerId: customerId, email });

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const quantity = Math.max(1, Number(session.metadata?.quantity || 1));

  const { data: existing } = await supabaseAdmin
    .from("licenses")
    .select("id")
    .eq(subscriptionId ? "stripe_subscription_id" : "stripe_payment_intent_id", subscriptionId || paymentIntentId)
    .maybeSingle();

  if (existing) {
    return;
  }

  await supabaseAdmin.from("licenses").insert({
    license_key: generateLicenseKey(),
    customer_email: email,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_payment_intent_id: paymentIntentId,
    plan: plan.licensePlan,
    billing_plan: plan.id,
    status: "active",
    quantity,
    expires_at: null
  });
}

export async function updateSubscriptionLicense(subscription: Stripe.Subscription): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const subscriptionId = subscription.id;
  const status = licenseStatusFromSubscription(subscription.status);
  const expiresAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await supabaseAdmin
    .from("licenses")
    .update({
      status,
      expires_at: expiresAt
    })
    .eq("stripe_subscription_id", subscriptionId);
}

export function readablePlan(plan: LicensePlan): string {
  if (plan === "subscription") {
    return "Subscription";
  }
  return "Lifetime";
}
