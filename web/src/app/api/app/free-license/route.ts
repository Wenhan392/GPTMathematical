import { NextResponse } from "next/server";
import { ensureFreeLicenseForEmail, getQuotaForLicense, normalizeEmail, type LicenseRecord } from "../../../../lib/fulfillment";
import { createActivationToken, hashDeviceId } from "../../../../lib/licenseKeys";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

interface FreeLicenseRequest {
  email?: string;
  deviceIdHash?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as FreeLicenseRequest;
    const email = normalizeEmail(body.email);
    const deviceIdHash = String(body.deviceIdHash || "").trim();

    if (!email || !deviceIdHash) {
      return NextResponse.json({ ok: false, status: "not_found", message: "Email is required to start the free plan." }, { status: 400 });
    }

    const license = await ensureFreeLicenseForEmail({ email });
    const deviceHash = hashDeviceId(deviceIdHash);
    const supabaseAdmin = getSupabaseAdmin();
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
      licenseKey: license.license_key,
      quota: await getQuotaForLicense(license as LicenseRecord),
      activationToken: createActivationToken({
        licenseKey: license.license_key,
        deviceIdHash,
        status: "active",
        plan: license.plan,
        expiresAt: license.expires_at,
        email
      })
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "not_found", message: error instanceof Error ? error.message : "Could not start free plan." },
      { status: 500 }
    );
  }
}
