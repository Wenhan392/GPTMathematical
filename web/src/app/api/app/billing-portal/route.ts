import { NextResponse } from "next/server";
import { siteUrl } from "../../../../lib/env";
import { getStripe } from "../../../../lib/stripe";
import { bearerToken, getLicenseForAccountToken } from "../../../../lib/fulfillment";

export async function POST(request: Request) {
  try {
    const license = await getLicenseForAccountToken(bearerToken(request));
    if (!license) {
      return NextResponse.json({ error: "Start a free account before opening billing." }, { status: 401 });
    }

    if (license.status !== "active" || !license.stripe_customer_id) {
      return NextResponse.json({ error: "No active paid billing profile was found for this account." }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: license.stripe_customer_id,
      return_url: `${siteUrl()}/success`
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open billing." },
      { status: 500 }
    );
  }
}
