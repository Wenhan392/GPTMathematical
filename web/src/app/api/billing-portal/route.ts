import { NextResponse } from "next/server";
import { normalizeEmail } from "../../../lib/fulfillment";
import { siteUrl } from "../../../lib/env";
import { getStripe } from "../../../lib/stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Sign in before opening billing." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Invalid account session." }, { status: 401 });
  }

  const email = normalizeEmail(data.user.email);
  const { data: customer } = await supabaseAdmin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("customer_email", email)
    .maybeSingle();

  if (!customer?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer was found for this account." }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: `${siteUrl()}/account`
  });

  return NextResponse.json({ url: session.url });
}
