import crypto from "node:crypto";
import type { LicensePlan } from "./plans";
import { requiredEnv } from "./env";

const keyAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLicenseKey(): string {
  const bytes = crypto.randomBytes(20);
  let raw = "";
  for (const byte of bytes) {
    raw += keyAlphabet[byte % keyAlphabet.length];
  }

  return `GPTM-${raw.match(/.{1,5}/g)?.join("-")}`;
}

export function hashDeviceId(deviceIdHash: string): string {
  return crypto.createHash("sha256").update(deviceIdHash).digest("hex");
}

export function createActivationToken(input: {
  licenseKey: string;
  deviceIdHash: string;
  status: string;
  plan: LicensePlan;
  expiresAt: string | null;
}): string {
  const payload = Buffer.from(JSON.stringify({
    licenseKey: input.licenseKey,
    deviceIdHash: input.deviceIdHash,
    status: input.status,
    plan: input.plan,
    expiresAt: input.expiresAt,
    issuedAt: new Date().toISOString()
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", requiredEnv("LICENSE_ACTIVATION_HMAC_SECRET"))
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}
