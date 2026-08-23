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
  email?: string;
}): string {
  const payload = Buffer.from(JSON.stringify({
    licenseKey: input.licenseKey,
    deviceIdHash: input.deviceIdHash,
    status: input.status,
    plan: input.plan,
    expiresAt: input.expiresAt,
    email: input.email,
    issuedAt: new Date().toISOString()
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", requiredEnv("LICENSE_ACTIVATION_HMAC_SECRET"))
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export interface ActivationTokenPayload {
  licenseKey: string;
  deviceIdHash: string;
  status: string;
  plan: LicensePlan;
  expiresAt: string | null;
  email?: string;
  issuedAt?: string;
}

export function verifyActivationToken(token: string): ActivationTokenPayload | undefined {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return undefined;
  }

  const expectedSignature = crypto
    .createHmac("sha256", requiredEnv("LICENSE_ACTIVATION_HMAC_SECRET"))
    .update(payload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ActivationTokenPayload;
    if (!parsed.licenseKey || !parsed.deviceIdHash || !parsed.plan) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
