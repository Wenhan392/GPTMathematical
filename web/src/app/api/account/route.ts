import { NextResponse } from "next/server";
import { getAppDownloadUrl } from "../../../lib/download";
import { getEffectiveEntitlement, normalizeEmail, readablePlan } from "../../../lib/fulfillment";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sign in before loading account details." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Invalid account session." }, { status: 401 });
  }

  const userId = data.user.id;
  const email = normalizeEmail(data.user.email);

  const entitlement = await getEffectiveEntitlement({ userId, email });

  const { data: licenses, error: licenseError } = await supabaseAdmin
    .from("licenses")
    .select("id, plan, status, expires_at, stripe_subscription_id, created_at, billing_plan")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (licenseError) {
    return NextResponse.json({ error: licenseError.message }, { status: 500 });
  }

  return NextResponse.json({
    email,
    plan: entitlement.license.plan,
    status: entitlement.license.status,
    quota: entitlement.quota,
    downloadUrl: getAppDownloadUrl(),
    billingPortalAvailable: entitlement.billingPortalAvailable,
    licenses: (licenses || []).map((license) => ({
      ...license,
      plan: readablePlan(license.plan)
    }))
  });
}
