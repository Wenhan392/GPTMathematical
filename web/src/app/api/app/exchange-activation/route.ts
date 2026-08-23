import { NextResponse } from "next/server";
import {
  createAppAccountSession,
  normalizeEmail,
  type LicenseRecord
} from "../../../../lib/fulfillment";
import { verifyActivationToken } from "../../../../lib/licenseKeys";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

interface ExchangeActivationRequest {
  activationToken?: string;
  deviceIdHash?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ExchangeActivationRequest;
    const activationToken = String(body.activationToken || "");
    const deviceIdHash = String(body.deviceIdHash || "").trim();
    const token = verifyActivationToken(activationToken);

    if (!token || !deviceIdHash || token.deviceIdHash !== deviceIdHash) {
      return NextResponse.json({ ok: false, message: "Could not migrate the old desktop activation." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: license, error } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("license_key", token.licenseKey)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    if (!license || (token.email && normalizeEmail(license.customer_email) !== normalizeEmail(token.email))) {
      return NextResponse.json({ ok: false, message: "Old activation was not found." }, { status: 404 });
    }

    const session = await createAppAccountSession({
      license: license as LicenseRecord,
      deviceIdHash
    });

    return NextResponse.json({
      ok: true,
      accountToken: session.accountToken,
      account: session.account
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Could not migrate activation." },
      { status: 500 }
    );
  }
}
