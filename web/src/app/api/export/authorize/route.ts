import { NextResponse } from "next/server";
import {
  authorizeExportForLicense,
  bearerToken,
  getLicenseForAccountToken,
  type ExportType,
  type LicenseRecord
} from "../../../../lib/fulfillment";
import { verifyActivationToken } from "../../../../lib/licenseKeys";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

interface ExportAuthorizeRequest {
  activationToken?: string;
  exportType?: ExportType;
  deviceIdHash?: string;
}

export async function POST(request: Request) {
  const body = await request.json() as ExportAuthorizeRequest;
  const exportType = body.exportType;

  if (exportType !== "word" && exportType !== "pdf") {
    return NextResponse.json({ ok: false, reason: "sign_in_required" }, { status: 400 });
  }

  let license: LicenseRecord | null = null;
  try {
    license = await getLicenseForAccountToken(bearerToken(request));
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: "sign_in_required", message: error instanceof Error ? error.message : "Could not authorize export." },
      { status: 500 }
    );
  }

  if (!license) {
    try {
      license = await getLegacyActivationLicense(body);
    } catch (error) {
      return NextResponse.json(
        { ok: false, reason: "sign_in_required", message: error instanceof Error ? error.message : "Could not authorize export." },
        { status: 500 }
      );
    }
  }

  if (!license) {
    return NextResponse.json({ ok: false, reason: "sign_in_required" }, { status: 401 });
  }

  const result = await authorizeExportForLicense({ license, exportType });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.reason === "quota_exceeded" ? 402 : 403 });
  }

  return NextResponse.json(result);
}

async function getLegacyActivationLicense(body: ExportAuthorizeRequest): Promise<LicenseRecord | null> {
  const activationToken = String(body.activationToken || "");
  const deviceIdHash = String(body.deviceIdHash || "").trim();
  if (!activationToken || !deviceIdHash) {
    return null;
  }

  const token = verifyActivationToken(activationToken);
  if (!token || token.deviceIdHash !== deviceIdHash) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("license_key", token.licenseKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? data as LicenseRecord : null;
}
