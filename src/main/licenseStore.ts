import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

export type EntitlementPlan = "free" | "plus_subscription" | "lifetime" | "admin_test" | string;
export type ExportType = "word" | "pdf";
export type PaidPlanId = "plus_monthly" | "plus_yearly" | "lifetime";
export type AccountStatus = "active" | "expired" | "revoked" | "not_found";

export interface ExportQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
  periodEnd: string | null;
}

export interface StoredLicense {
  email: string;
  accountToken?: string;
  licenseKey?: string;
  activationToken?: string;
  plan: EntitlementPlan;
  status: AccountStatus;
  validatedAt: string;
  quota?: ExportQuota;
  billingPortalAvailable?: boolean;
}

export interface LicenseCheckResult {
  usable: boolean;
  message: string;
  license?: StoredLicense;
}

export interface AccountState {
  signedIn: boolean;
  email?: string;
  plan: EntitlementPlan | "signed_out";
  status: AccountStatus | "signed_out";
  quota?: ExportQuota;
  billingPortalAvailable?: boolean;
  message: string;
}

export interface ActivationResult {
  ok: boolean;
  message: string;
  license?: StoredLicense;
}

export interface ExportAuthorizationResult {
  ok: boolean;
  message: string;
  plan?: EntitlementPlan;
  quota?: ExportQuota;
}

export interface ExternalUrlResult {
  ok: boolean;
  message: string;
  url?: string;
}

interface AccountApiState {
  signedIn: boolean;
  email?: string;
  plan: EntitlementPlan | "signed_out";
  status: AccountStatus | "signed_out";
  quota?: ExportQuota;
  billingPortalAvailable?: boolean;
  message: string;
}

interface AccountApiResponse {
  ok: boolean;
  accountToken?: string;
  account?: AccountApiState;
  message?: string;
}

interface LegacyLicenseApiResponse {
  ok: boolean;
  status: AccountStatus;
  activationToken?: string;
  licenseKey?: string;
  plan?: EntitlementPlan;
  quota?: ExportQuota;
  message?: string;
}

interface ExportAuthorizeApiResponse {
  ok: boolean;
  reason?: "sign_in_required" | "quota_exceeded" | "expired" | "revoked";
  plan?: EntitlementPlan;
  quota?: ExportQuota;
  message?: string;
}

interface ExternalUrlApiResponse {
  url?: string;
  error?: string;
}

const offlineGraceMs = 7 * 24 * 60 * 60 * 1000;
const defaultLicenseApiBaseUrl = "https://gpt-mathematical-web.vercel.app/api/license";

export class LicenseStore {
  private readonly filePath: string;
  private readonly apiBaseUrl: string;
  private readonly localTestLicense: LocalTestLicense | undefined;

  constructor(
    filePath = path.join(app.getPath("userData"), "license.json"),
    apiBaseUrl = (process.env.GPT_MATH_LICENSE_API_URL || defaultLicenseApiBaseUrl).replace(/\/$/, "")
  ) {
    loadLocalEnv();
    this.filePath = filePath;
    this.apiBaseUrl = apiBaseUrl;
    this.localTestLicense = getLocalTestLicense();
  }

  async validateCachedLicense(): Promise<LicenseCheckResult> {
    const license = this.read();
    if (!license) {
      return { usable: false, message: "Start a free account before exporting." };
    }

    if (license.plan === "admin_test") {
      return { usable: true, message: "Using local admin test account.", license };
    }

    const account = await this.refreshAccountState();
    const refreshed = this.read();
    if (account.signedIn && refreshed?.status === "active") {
      return { usable: true, message: "Account refreshed.", license: refreshed };
    }

    if (
      isUnlimitedPlan(license.plan) &&
      license.status === "active" &&
      Date.now() - Date.parse(license.validatedAt) <= offlineGraceMs
    ) {
      return { usable: true, message: "Using cached Plus/Lifetime account while offline.", license };
    }

    return { usable: false, message: account.message || "Could not refresh the cached account." };
  }

  getAccountState(): AccountState {
    const license = this.read();
    if (!license) {
      return signedOutAccount();
    }

    return {
      signedIn: true,
      email: license.email,
      plan: license.plan,
      status: license.status,
      quota: license.quota,
      billingPortalAvailable: license.billingPortalAvailable,
      message: licenseStatusSummary(license)
    };
  }

  async refreshAccountState(): Promise<AccountState> {
    const license = this.read();
    if (!license) {
      return signedOutAccount();
    }

    if (license.plan === "admin_test") {
      return this.getAccountState();
    }

    if (!license.accountToken && license.activationToken) {
      const migrated = await this.exchangeLegacyActivation(license);
      if (migrated.ok) {
        return this.getAccountState();
      }
    }

    const current = this.read();
    if (!current?.accountToken) {
      return {
        ...signedOutAccount(),
        email: current?.email,
        message: "Start a free account to export Word and PDF files."
      };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/app/account`, {
        method: "GET",
        headers: this.accountHeaders(current.accountToken)
      });
      const result = await response.json() as AccountApiResponse;

      if (!response.ok || !result.ok || !result.account) {
        return {
          ...this.getAccountState(),
          message: result.message || result.account?.message || "Could not refresh account."
        };
      }

      this.writeFromAccount(current.accountToken, result.account);
      return this.getAccountState();
    } catch {
      if (
        isUnlimitedPlan(current.plan) &&
        current.status === "active" &&
        Date.now() - Date.parse(current.validatedAt) <= offlineGraceMs
      ) {
        return {
          ...this.getAccountState(),
          message: "Using cached Plus/Lifetime account while offline."
        };
      }

      return {
        ...this.getAccountState(),
        message: "Could not reach the account server. Connect to the internet and try again."
      };
    }
  }

  async activate(email: string, licenseKey: string, swallowNetworkErrors = true): Promise<ActivationResult> {
    const localActivation = this.activateLocalTestLicense(email, licenseKey);
    if (localActivation) {
      return localActivation;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          licenseKey,
          deviceIdHash: this.deviceIdHash()
        })
      });
      const result = await response.json() as LegacyLicenseApiResponse;

      if (!response.ok || !result.ok || !result.activationToken || !result.plan) {
        return { ok: false, message: result.message || legacyLicenseStatusMessage(result.status) };
      }

      const legacy: StoredLicense = {
        email: email.trim().toLowerCase(),
        licenseKey: licenseKey.trim().toUpperCase(),
        activationToken: result.activationToken,
        plan: result.plan,
        status: result.status,
        validatedAt: new Date().toISOString(),
        quota: result.quota
      };
      await this.exchangeLegacyActivation(legacy);
      return { ok: true, message: "Account activated.", license: this.read() };
    } catch (error) {
      if (!swallowNetworkErrors) {
        throw error;
      }
      return { ok: false, message: "Could not reach the account server. Check your connection and try again." };
    }
  }

  async activateFreeAccount(email: string): Promise<ActivationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { ok: false, message: "Enter your email to start the free plan." };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/app/free-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          deviceIdHash: this.deviceIdHash()
        })
      });
      const result = await response.json() as AccountApiResponse;

      if (!response.ok || !result.ok || !result.accountToken || !result.account) {
        return { ok: false, message: result.message || result.account?.message || "Could not start free account." };
      }

      this.writeFromAccount(result.accountToken, result.account, normalizedEmail);
      return {
        ok: true,
        message: "Free account ready. You have 15 Word/PDF exports this month.",
        license: this.read()
      };
    } catch {
      return { ok: false, message: "Could not reach the account server. Check your connection and try again." };
    }
  }

  async authorizeExport(exportType: ExportType): Promise<ExportAuthorizationResult> {
    const license = this.read();
    if (!license) {
      return {
        ok: false,
        message: "Start a free account to export Word/PDF files."
      };
    }

    if (license.plan === "admin_test") {
      return { ok: true, message: "Local admin test export allowed.", plan: license.plan, quota: license.quota };
    }

    if (!license.accountToken && license.activationToken) {
      await this.exchangeLegacyActivation(license);
    }

    const current = this.read();
    if (!current?.accountToken) {
      return {
        ok: false,
        message: "Start a free account to export Word/PDF files."
      };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/export/authorize`, {
        method: "POST",
        headers: {
          ...this.accountHeaders(current.accountToken),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exportType,
          activationToken: current.activationToken,
          deviceIdHash: this.deviceIdHash()
        })
      });
      const result = await response.json() as ExportAuthorizeApiResponse;

      if (!response.ok || !result.ok) {
        return {
          ok: false,
          message: exportAuthorizationMessage(result.reason, result.quota),
          plan: result.plan,
          quota: result.quota
        };
      }

      const updatedLicense: StoredLicense = {
        ...current,
        plan: result.plan || current.plan,
        quota: result.quota,
        status: "active",
        validatedAt: new Date().toISOString()
      };
      this.write(updatedLicense);
      return {
        ok: true,
        message: result.quota?.limit === null
          ? "Unlimited export allowed."
          : `Export allowed. ${result.quota?.remaining ?? 0} free exports remaining this month.`,
        plan: updatedLicense.plan,
        quota: updatedLicense.quota
      };
    } catch {
      if (isUnlimitedPlan(current.plan) && current.status === "active" && Date.now() - Date.parse(current.validatedAt) <= offlineGraceMs) {
        return {
          ok: true,
          message: "Using cached Plus/Lifetime account while offline.",
          plan: current.plan,
          quota: current.quota
        };
      }

      return {
        ok: false,
        message: "Could not reach the account server. Free exports require an internet connection so the monthly quota stays accurate."
      };
    }
  }

  async startCheckout(plan: PaidPlanId): Promise<ExternalUrlResult> {
    const license = this.read();
    if (!license?.accountToken) {
      return { ok: false, message: "Start a free account first, then upgrade in one click." };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/app/checkout`, {
        method: "POST",
        headers: {
          ...this.accountHeaders(license.accountToken),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ plan, quantity: 1 })
      });
      const result = await response.json() as ExternalUrlApiResponse;

      if (!response.ok || !result.url) {
        return { ok: false, message: result.error || "Could not start checkout." };
      }

      return { ok: true, message: "Opening secure Stripe Checkout.", url: result.url };
    } catch {
      return { ok: false, message: "Could not reach the checkout server. Check your connection and try again." };
    }
  }

  async openBillingPortal(): Promise<ExternalUrlResult> {
    const license = this.read();
    if (!license?.accountToken) {
      return { ok: false, message: "Start a free or paid account before opening billing." };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/app/billing-portal`, {
        method: "POST",
        headers: this.accountHeaders(license.accountToken)
      });
      const result = await response.json() as ExternalUrlApiResponse;

      if (!response.ok || !result.url) {
        return { ok: false, message: result.error || "Could not open billing." };
      }

      return { ok: true, message: "Opening secure billing portal.", url: result.url };
    } catch {
      return { ok: false, message: "Could not reach the billing server. Check your connection and try again." };
    }
  }

  private async exchangeLegacyActivation(license: StoredLicense): Promise<ActivationResult> {
    if (!license.activationToken) {
      return { ok: false, message: "No old activation found to migrate." };
    }

    try {
      const response = await fetch(`${this.webApiBaseUrl()}/app/exchange-activation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activationToken: license.activationToken,
          deviceIdHash: this.deviceIdHash()
        })
      });
      const result = await response.json() as AccountApiResponse;
      if (!response.ok || !result.ok || !result.accountToken || !result.account) {
        return { ok: false, message: result.message || "Could not migrate old activation." };
      }

      this.writeFromAccount(result.accountToken, result.account, license.email);
      return { ok: true, message: "Account migrated.", license: this.read() };
    } catch {
      return { ok: false, message: "Could not migrate old activation." };
    }
  }

  private read(): StoredLicense | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as StoredLicense;
    } catch {
      return undefined;
    }
  }

  private write(license: StoredLicense): void {
    const sanitized: StoredLicense = {
      email: license.email,
      accountToken: license.accountToken,
      plan: license.plan,
      status: license.status,
      validatedAt: license.validatedAt,
      quota: license.quota,
      billingPortalAvailable: license.billingPortalAvailable
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(sanitized, null, 2), "utf8");
  }

  private writeFromAccount(accountToken: string, account: AccountApiState, fallbackEmail?: string): void {
    if (!account.signedIn || account.plan === "signed_out" || account.status === "signed_out") {
      return;
    }

    this.write({
      email: (account.email || fallbackEmail || "").trim().toLowerCase(),
      accountToken,
      plan: account.plan,
      status: account.status,
      validatedAt: new Date().toISOString(),
      quota: account.quota,
      billingPortalAvailable: account.billingPortalAvailable
    });
  }

  private accountHeaders(accountToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accountToken}` };
  }

  private deviceIdHash(): string {
    const identity = [
      os.hostname(),
      os.userInfo().username,
      app.getPath("userData")
    ].join("|");
    return crypto.createHash("sha256").update(identity).digest("hex");
  }

  private webApiBaseUrl(): string {
    return this.apiBaseUrl.replace(/\/license$/, "");
  }

  private activateLocalTestLicense(email: string, licenseKey: string): ActivationResult | undefined {
    if (!this.localTestLicense) {
      return undefined;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedKey = licenseKey.trim().toUpperCase();
    if (normalizedEmail !== this.localTestLicense.email || normalizedKey !== this.localTestLicense.licenseKey) {
      return undefined;
    }

    const license: StoredLicense = {
      email: normalizedEmail,
      accountToken: "local-admin-test",
      plan: "admin_test",
      status: "active",
      validatedAt: new Date().toISOString(),
      quota: { limit: null, used: 0, remaining: null, periodEnd: null },
      billingPortalAvailable: false
    };
    this.write(license);
    return { ok: true, message: "Local admin test account activated.", license };
  }
}

interface LocalTestLicense {
  email: string;
  licenseKey: string;
}

function signedOutAccount(): AccountState {
  return {
    signedIn: false,
    plan: "signed_out",
    status: "signed_out",
    billingPortalAvailable: false,
    message: "Start a free account to export Word and PDF files."
  };
}

function getLocalTestLicense(): LocalTestLicense | undefined {
  if (app.isPackaged) {
    return undefined;
  }

  if (process.env.GPT_MATH_ENABLE_LOCAL_TEST_LICENSE !== "true") {
    return undefined;
  }

  const email = process.env.GPT_MATH_TEST_LICENSE_EMAIL?.trim().toLowerCase();
  const licenseKey = process.env.GPT_MATH_TEST_LICENSE_KEY?.trim().toUpperCase();
  if (!email || !licenseKey) {
    return undefined;
  }

  return { email, licenseKey };
}

function loadLocalEnv(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function legacyLicenseStatusMessage(status: LegacyLicenseApiResponse["status"]): string {
  if (status === "expired") {
    return "This account is expired. Open the Account tab to renew or manage billing.";
  }
  if (status === "revoked") {
    return "This account has been revoked.";
  }
  return "Account was not found for this email.";
}

function isUnlimitedPlan(plan: EntitlementPlan): boolean {
  return plan === "plus_subscription" || plan === "lifetime";
}

function licenseStatusSummary(license: StoredLicense): string {
  if (license.plan === "free") {
    const remaining = license.quota?.remaining;
    return remaining === undefined
      ? "Free account active. Quota will refresh after the next export check."
      : `Free account active. ${remaining} exports remaining this month.`;
  }

  if (isUnlimitedPlan(license.plan)) {
    return "Unlimited exports active.";
  }

  return "Account active.";
}

function exportAuthorizationMessage(reason: ExportAuthorizeApiResponse["reason"], quota?: ExportQuota): string {
  if (reason === "quota_exceeded") {
    return quota?.periodEnd
      ? `Free export limit reached. Your 15 exports reset on ${new Date(quota.periodEnd).toLocaleDateString()}. Open the Account tab to upgrade for unlimited exports.`
      : "Free export limit reached. Open the Account tab to upgrade for unlimited exports.";
  }

  if (reason === "expired") {
    return "Your Plus subscription is no longer active. Open the Account tab to manage billing or use a free account.";
  }

  if (reason === "revoked") {
    return "This account has been revoked.";
  }

  return "Start a free account to export Word/PDF files.";
}
