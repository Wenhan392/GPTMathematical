import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

export interface StoredLicense {
  email: string;
  licenseKey: string;
  activationToken: string;
  plan: string;
  status: "active" | "expired" | "revoked" | "not_found";
  validatedAt: string;
}

export interface LicenseCheckResult {
  usable: boolean;
  message: string;
  license?: StoredLicense;
}

export interface ActivationResult {
  ok: boolean;
  message: string;
  license?: StoredLicense;
}

interface LicenseApiResponse {
  ok: boolean;
  status: "active" | "expired" | "revoked" | "not_found";
  activationToken?: string;
  plan?: string;
  message?: string;
}

const offlineGraceMs = 7 * 24 * 60 * 60 * 1000;

export class LicenseStore {
  private readonly filePath: string;
  private readonly apiBaseUrl: string;
  private readonly localTestLicense: LocalTestLicense | undefined;

  constructor(
    filePath = path.join(app.getPath("userData"), "license.json"),
    apiBaseUrl = (process.env.GPT_MATH_LICENSE_API_URL || "http://localhost:3000/api/license").replace(/\/$/, "")
  ) {
    loadLocalEnv();
    this.filePath = filePath;
    this.apiBaseUrl = apiBaseUrl;
    this.localTestLicense = getLocalTestLicense();
  }

  async validateCachedLicense(): Promise<LicenseCheckResult> {
    const license = this.read();
    if (!license) {
      return { usable: false, message: "Activate GPT Mathematical to continue." };
    }

    try {
      const activation = await this.activate(license.email, license.licenseKey, false);
      if (activation.ok && activation.license) {
        return { usable: true, message: "License validated.", license: activation.license };
      }
      return { usable: false, message: activation.message };
    } catch {
      if (license.status === "active" && Date.now() - Date.parse(license.validatedAt) <= offlineGraceMs) {
        return { usable: true, message: "Using cached activation while offline.", license };
      }
      return { usable: false, message: "Could not validate the cached license. Connect to the internet and activate again." };
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
      const result = await response.json() as LicenseApiResponse;

      if (!response.ok || !result.ok || !result.activationToken || !result.plan) {
        return {
          ok: false,
          message: result.message || licenseStatusMessage(result.status)
        };
      }

      const license: StoredLicense = {
        email: email.trim().toLowerCase(),
        licenseKey: licenseKey.trim().toUpperCase(),
        activationToken: result.activationToken,
        plan: result.plan,
        status: result.status,
        validatedAt: new Date().toISOString()
      };
      this.write(license);
      return { ok: true, message: "License activated.", license };
    } catch (error) {
      if (!swallowNetworkErrors) {
        throw error;
      }
      return { ok: false, message: "Could not reach the license server. Check your connection and try again." };
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
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(license, null, 2), "utf8");
  }

  private deviceIdHash(): string {
    const identity = [
      os.hostname(),
      os.userInfo().username,
      app.getPath("userData")
    ].join("|");
    return crypto.createHash("sha256").update(identity).digest("hex");
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

    const activationToken = [
      "local-test",
      crypto.createHash("sha256").update(`${normalizedEmail}|${normalizedKey}|${this.deviceIdHash()}`).digest("hex")
    ].join(".");
    const license: StoredLicense = {
      email: normalizedEmail,
      licenseKey: normalizedKey,
      activationToken,
      plan: "admin_test",
      status: "active",
      validatedAt: new Date().toISOString()
    };
    this.write(license);
    return { ok: true, message: "Local admin test license activated.", license };
  }
}

interface LocalTestLicense {
  email: string;
  licenseKey: string;
}

function getLocalTestLicense(): LocalTestLicense | undefined {
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

function licenseStatusMessage(status: LicenseApiResponse["status"]): string {
  if (status === "expired") {
    return "This license is expired. Open your account portal to renew or manage billing.";
  }
  if (status === "revoked") {
    return "This license has been revoked.";
  }
  return "License key was not found for this email.";
}
