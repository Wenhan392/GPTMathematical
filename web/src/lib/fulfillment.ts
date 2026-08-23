import crypto from "node:crypto";
import type Stripe from "stripe";
import { checkoutPlans, freeExportLimit, type LicensePlan, type PaidPlanId } from "./plans";
import { requiredEnv } from "./env";
import { getStripe } from "./stripe";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { generateLicenseKey } from "./licenseKeys";

export type LicenseStatus = "active" | "expired" | "revoked";
export type ExportType = "word" | "pdf";

export interface LicenseRecord {
  id: string;
  license_key: string;
  user_id: string | null;
  customer_email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  plan: LicensePlan;
  billing_plan: string;
  status: LicenseStatus;
  quantity: number;
  expires_at: string | null;
  created_at: string;
}

export interface ExportQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
  periodEnd: string | null;
}

export interface EntitlementSummary {
  license: LicenseRecord;
  quota: ExportQuota;
  billingPortalAvailable: boolean;
}

export interface AppAccountState {
  signedIn: boolean;
  email?: string;
  plan: LicensePlan | "signed_out";
  status: LicenseStatus | "signed_out";
  quota?: ExportQuota;
  billingPortalAvailable: boolean;
  message: string;
}

export interface AppAccountSession {
  accountToken: string;
  license: LicenseRecord;
  account: AppAccountState;
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export function licenseStatusFromSubscription(status: string | null | undefined): LicenseStatus {
  return status === "active" || status === "trialing" ? "active" : "expired";
}

export function isUnlimitedPlan(plan: LicensePlan): boolean {
  return plan === "plus_subscription" || plan === "lifetime";
}

export function hashAccountToken(accountToken: string): string {
  return crypto.createHash("sha256").update(accountToken).digest("hex");
}

export function createAccountToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
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

export async function ensureStripeCustomerForLicense(license: LicenseRecord): Promise<string> {
  const email = normalizeEmail(license.customer_email);
  if (license.stripe_customer_id) {
    await upsertStripeCustomer({
      stripeCustomerId: license.stripe_customer_id,
      email,
      userId: license.user_id
    });
    await getStripe().customers.update(license.stripe_customer_id, {
      email: email || undefined,
      metadata: { app_account_id: license.id }
    });
    return license.stripe_customer_id;
  }

  const customer = await getStripe().customers.create({
    email: email || undefined,
    metadata: { app_account_id: license.id }
  });
  const customerId = customer.id;
  const supabaseAdmin = getSupabaseAdmin();
  await upsertStripeCustomer({
    stripeCustomerId: customerId,
    email,
    userId: license.user_id
  });
  await supabaseAdmin
    .from("licenses")
    .update({ stripe_customer_id: customerId })
    .eq("id", license.id);

  return customerId;
}

export async function createCheckoutSessionForLicense(input: {
  license: LicenseRecord;
  planId: PaidPlanId;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  integrationIdentifier: string;
}): Promise<Stripe.Checkout.Session> {
  const plan = checkoutPlans[input.planId];
  if (!plan) {
    throw new Error("Unknown checkout plan.");
  }

  const customerId = await ensureStripeCustomerForLicense(input.license);
  const metadata = {
    app_account_id: input.license.id,
    license_id: input.license.id,
    plan: plan.id,
    quantity: String(input.quantity)
  };

  return getStripe().checkout.sessions.create({
    mode: plan.mode,
    line_items: [{
      price: requiredEnv(plan.priceEnv),
      quantity: input.quantity
    }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    customer: customerId,
    client_reference_id: input.license.id,
    metadata,
    subscription_data: plan.mode === "subscription" ? { metadata } : undefined,
    customer_update: { name: "auto", address: "auto" },
    integration_identifier: input.integrationIdentifier
  } as Stripe.Checkout.SessionCreateParams & { integration_identifier: string });
}

export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const planId = session.metadata?.plan as PaidPlanId | undefined;
  const plan = planId ? checkoutPlans[planId] : undefined;
  const customerId = typeof session.customer === "string" ? session.customer : undefined;
  const email = normalizeEmail(session.customer_details?.email || session.customer_email);

  if (!plan || !customerId) {
    throw new Error("Checkout session is missing plan or customer.");
  }

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const quantity = Math.max(1, Number(session.metadata?.quantity || 1));
  const accountId = session.metadata?.app_account_id || session.metadata?.license_id || session.client_reference_id || "";

  const licenseValues = {
    customer_email: email,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_payment_intent_id: paymentIntentId,
    plan: plan.licensePlan,
    billing_plan: plan.id,
    status: "active" as LicenseStatus,
    quantity,
    expires_at: null
  };

  if (accountId) {
    const { data: license, error } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (license) {
      const nextEmail = email || normalizeEmail((license as LicenseRecord).customer_email);
      await upsertStripeCustomer({
        stripeCustomerId: customerId,
        email: nextEmail,
        userId: (license as LicenseRecord).user_id
      });
      await supabaseAdmin
        .from("licenses")
        .update({ ...licenseValues, customer_email: nextEmail })
        .eq("id", accountId);
      return;
    }
  }

  if (!email) {
    throw new Error("Checkout session is missing account identity and customer email.");
  }

  await upsertStripeCustomer({ stripeCustomerId: customerId, email });

  const { data: existing } = await supabaseAdmin
    .from("licenses")
    .select("id")
    .eq(subscriptionId ? "stripe_subscription_id" : "stripe_payment_intent_id", subscriptionId || paymentIntentId)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { data: freeLicenses, error: freeLicenseError } = await supabaseAdmin
    .from("licenses")
    .select("id")
    .eq("customer_email", email)
    .eq("plan", "free")
    .order("created_at", { ascending: false })
    .limit(1);

  if (freeLicenseError) {
    throw new Error(freeLicenseError.message);
  }

  const freeLicense = freeLicenses?.[0];
  if (freeLicense) {
    await supabaseAdmin
      .from("licenses")
      .update(licenseValues)
      .eq("id", freeLicense.id);
    return;
  }

  await supabaseAdmin.from("licenses").insert({
    license_key: generateLicenseKey(),
    ...licenseValues
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
  if (plan === "plus_subscription") {
    return "Plus";
  }
  if (plan === "free") {
    return "Free";
  }
  return "Lifetime";
}

export async function ensureFreeLicenseForUser(input: { userId: string; email: string }): Promise<LicenseRecord> {
  const supabaseAdmin = getSupabaseAdmin();
  const email = normalizeEmail(input.email);

  await supabaseAdmin
    .from("users")
    .upsert({ id: input.userId, email }, { onConflict: "id" });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("user_id", input.userId)
    .eq("plan", "free")
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing as LicenseRecord;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("licenses")
    .insert({
      license_key: generateLicenseKey(),
      user_id: input.userId,
      customer_email: email,
      plan: "free",
      billing_plan: "free",
      status: "active",
      quantity: 1,
      expires_at: null
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return inserted as LicenseRecord;
}

export async function ensureFreeLicenseForEmail(input: { email: string }): Promise<LicenseRecord> {
  const supabaseAdmin = getSupabaseAdmin();
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Email is required.");
  }

  const { data: licenses, error: existingError } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("customer_email", email)
    .order("created_at", { ascending: false });

  if (existingError) {
    throw new Error(existingError.message);
  }

  const effective = chooseEffectiveLicense((licenses || []) as LicenseRecord[]);
  if (effective) {
    return effective;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("licenses")
    .insert({
      license_key: generateLicenseKey(),
      user_id: null,
      customer_email: email,
      plan: "free",
      billing_plan: "free",
      status: "active",
      quantity: 1,
      expires_at: null
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return inserted as LicenseRecord;
}

export async function createAppAccountSession(input: {
  license: LicenseRecord;
  deviceIdHash: string;
}): Promise<AppAccountSession> {
  const deviceIdHash = String(input.deviceIdHash || "").trim();
  if (!deviceIdHash) {
    throw new Error("Device identity is required.");
  }

  const accountToken = createAccountToken();
  const accountTokenHash = hashAccountToken(accountToken);
  const now = new Date().toISOString();
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("app_account_sessions")
    .upsert({
      license_id: input.license.id,
      device_id_hash: deviceIdHash,
      account_token_hash: accountTokenHash,
      last_seen_at: now
    }, { onConflict: "license_id,device_id_hash" });

  if (error) {
    throw new Error(error.message);
  }

  return {
    accountToken,
    license: input.license,
    account: await getAppAccountState(input.license)
  };
}

export async function getLicenseForAccountToken(accountToken: string): Promise<LicenseRecord | null> {
  const token = String(accountToken || "").trim();
  if (!token) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("app_account_sessions")
    .select("license_id")
    .eq("account_token_hash", hashAccountToken(token))
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.license_id) {
    return null;
  }

  await supabaseAdmin
    .from("app_account_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("account_token_hash", hashAccountToken(token));

  const { data: license, error: licenseError } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("id", session.license_id)
    .maybeSingle();

  if (licenseError) {
    throw new Error(licenseError.message);
  }

  return license ? license as LicenseRecord : null;
}

export async function getAppAccountState(license: LicenseRecord): Promise<AppAccountState> {
  const quota = await getQuotaForLicense(license);
  return {
    signedIn: true,
    email: normalizeEmail(license.customer_email),
    plan: license.plan,
    status: license.status,
    quota,
    billingPortalAvailable: Boolean(license.stripe_customer_id),
    message: appAccountMessage(license, quota)
  };
}

export async function getEffectiveEntitlement(input: { userId: string; email: string }): Promise<EntitlementSummary> {
  const supabaseAdmin = getSupabaseAdmin();
  const email = normalizeEmail(input.email);

  await ensureFreeLicenseForUser({ userId: input.userId, email });
  await supabaseAdmin.from("licenses").update({ user_id: input.userId }).eq("customer_email", email);
  await supabaseAdmin.from("stripe_customers").update({ user_id: input.userId }).eq("customer_email", email);

  const { data: licenses, error } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const effective = chooseEffectiveLicense((licenses || []) as LicenseRecord[]);
  if (!effective) {
    throw new Error("Could not create an account license.");
  }

  return {
    license: effective,
    quota: await getQuotaForLicense(effective),
    billingPortalAvailable: Boolean(effective.stripe_customer_id || (licenses || []).some((license) => license.stripe_customer_id))
  };
}

export function chooseEffectiveLicense(licenses: LicenseRecord[]): LicenseRecord | undefined {
  const active = licenses.filter((license) => license.status === "active");
  return (
    active.find((license) => license.plan === "lifetime") ||
    active.find((license) => license.plan === "plus_subscription") ||
    active.find((license) => license.plan === "free") ||
    licenses.find((license) => license.plan === "free") ||
    licenses[0]
  );
}

export async function getQuotaForLicense(license: LicenseRecord): Promise<ExportQuota> {
  if (isUnlimitedPlan(license.plan) && license.status === "active") {
    return { limit: null, used: 0, remaining: null, periodEnd: null };
  }

  const period = currentUsagePeriod();
  const usage = await getCurrentUsage(license.id, period);
  const used = usage.word_exports + usage.pdf_exports;
  return {
    limit: freeExportLimit,
    used,
    remaining: Math.max(0, freeExportLimit - used),
    periodEnd: period.periodEnd
  };
}

export async function authorizeExportForLicense(input: { license: LicenseRecord; exportType: ExportType }): Promise<{ ok: true; plan: LicensePlan; quota: ExportQuota } | { ok: false; reason: "quota_exceeded" | "expired" | "revoked"; plan: LicensePlan; quota?: ExportQuota }> {
  if (input.license.status === "revoked") {
    return { ok: false, reason: "revoked", plan: input.license.plan };
  }

  if (isUnlimitedPlan(input.license.plan) && input.license.status === "active") {
    return { ok: true, plan: input.license.plan, quota: await getQuotaForLicense(input.license) };
  }

  if (input.license.status !== "active") {
    if (input.license.user_id) {
      const freeLicense = await ensureFreeLicenseForUser({
        userId: input.license.user_id,
        email: input.license.customer_email
      });
      return authorizeExportForLicense({ license: freeLicense, exportType: input.exportType });
    }
    return { ok: false, reason: "expired", plan: input.license.plan };
  }

  const period = currentUsagePeriod();
  const usage = await getCurrentUsage(input.license.id, period);
  const used = usage.word_exports + usage.pdf_exports;
  if (used >= freeExportLimit) {
    return {
      ok: false,
      reason: "quota_exceeded",
      plan: "free",
      quota: {
        limit: freeExportLimit,
        used,
        remaining: 0,
        periodEnd: period.periodEnd
      }
    };
  }

  const nextWordExports = usage.word_exports + (input.exportType === "word" ? 1 : 0);
  const nextPdfExports = usage.pdf_exports + (input.exportType === "pdf" ? 1 : 0);
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("export_usage")
    .upsert({
      license_id: input.license.id,
      user_id: input.license.user_id,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      word_exports: nextWordExports,
      pdf_exports: nextPdfExports,
      updated_at: new Date().toISOString()
    }, { onConflict: "license_id,period_start" })
    .select("word_exports, pdf_exports")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const nextUsed = Number(data.word_exports || 0) + Number(data.pdf_exports || 0);
  return {
    ok: true,
    plan: "free",
    quota: {
      limit: freeExportLimit,
      used: nextUsed,
      remaining: Math.max(0, freeExportLimit - nextUsed),
      periodEnd: period.periodEnd
    }
  };
}

function appAccountMessage(license: LicenseRecord, quota: ExportQuota): string {
  if (license.status === "revoked") {
    return "This account is revoked. Contact support before exporting.";
  }

  if (license.status !== "active") {
    return "Your paid plan is no longer active. You can manage billing or start a free account.";
  }

  if (license.plan === "free") {
    return `Free account active. ${quota.remaining ?? 0} exports remaining this month.`;
  }

  return `${readablePlan(license.plan)} account active. Unlimited Word and PDF exports are unlocked.`;
}

function currentUsagePeriod(now = new Date()): { periodStart: string; periodEnd: string } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString()
  };
}

async function getCurrentUsage(
  licenseId: string,
  period = currentUsagePeriod()
): Promise<{ word_exports: number; pdf_exports: number }> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("export_usage")
    .select("word_exports, pdf_exports")
    .eq("license_id", licenseId)
    .eq("period_start", period.periodStart)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    word_exports: Number(data?.word_exports || 0),
    pdf_exports: Number(data?.pdf_exports || 0)
  };
}
