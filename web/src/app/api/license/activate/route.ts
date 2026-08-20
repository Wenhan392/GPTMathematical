import { NextResponse } from "next/server";
import { createActivationToken, hashDeviceId } from "../../../../lib/licenseKeys";
import { normalizeEmail } from "../../../../lib/fulfillment";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

interface ActivationRequest {
  email?: string;
  licenseKey?: string;
  deviceIdHash?: string;
}

export async function POST(request: Request) {
  const body = await request.json() as ActivationRequest;
  const email = normalizeEmail(body.email);
  const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
  const deviceIdHash = String(body.deviceIdHash || "").trim();

  if (!email || !licenseKey || !deviceIdHash) {
    return NextResponse.json({ ok: false, status: "not_found", message: "Email, license key, and device ID are required." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: license, error } = await supabaseAdmin
    .from("licenses")
    .select("id, license_key, customer_email, plan, status, expires_at, quantity")
    .eq("license_key", licenseKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, status: "not_found", message: error.message }, { status: 500 });
  }

  if (!license || normalizeEmail(license.customer_email) !== email) {
    return NextResponse.json({ ok: false, status: "not_found" }, { status: 404 });
  }

  if (license.status !== "active") {
    return NextResponse.json({ ok: false, status: license.status, plan: license.plan });
  }

  const deviceHash = hashDeviceId(deviceIdHash);
  const { data: activations } = await supabaseAdmin
    .from("license_activations")
    .select("id, device_id_hash")
    .eq("license_id", license.id);

  const existing = (activations || []).find((activation) => activation.device_id_hash === deviceHash);
  if (!existing && (activations || []).length >= Number(license.quantity || 1)) {
    return NextResponse.json({ ok: false, status: "active", plan: license.plan, message: "Activation limit reached." }, { status: 403 });
  }

  await supabaseAdmin.from("license_activations").upsert({
    license_id: license.id,
    device_id_hash: deviceHash,
    activated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  }, { onConflict: "license_id,device_id_hash" });

  return NextResponse.json({
    ok: true,
    status: "active",
    plan: license.plan,
    activationToken: createActivationToken({
      licenseKey: license.license_key,
      deviceIdHash,
      status: "active",
      plan: license.plan,
      expiresAt: license.expires_at
    })
  });
}
