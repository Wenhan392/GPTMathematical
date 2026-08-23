import { NextResponse } from "next/server";
import { checkoutPlans, normalizeQuantity, type PaidPlanId } from "../../../../lib/plans";
import { siteUrl } from "../../../../lib/env";
import { integrationIdentifier } from "../../../../lib/stripe";
import {
  bearerToken,
  createCheckoutSessionForLicense,
  getLicenseForAccountToken
} from "../../../../lib/fulfillment";

interface AppCheckoutRequest {
  plan?: PaidPlanId;
  quantity?: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AppCheckoutRequest;
    const license = await getLicenseForAccountToken(bearerToken(request));
    if (!license) {
      return NextResponse.json({ error: "Start a free account before upgrading." }, { status: 401 });
    }

    if (body.plan !== "plus_monthly" && body.plan !== "plus_yearly" && body.plan !== "lifetime") {
      return NextResponse.json({ error: "Unknown checkout plan." }, { status: 400 });
    }

    const plan = checkoutPlans[body.plan];
    const baseUrl = siteUrl();
    const session = await createCheckoutSessionForLicense({
      license,
      planId: body.plan,
      quantity: normalizeQuantity(plan, body.quantity),
      successUrl: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/success?checkout=cancelled`,
      integrationIdentifier
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create checkout session." },
      { status: 500 }
    );
  }
}
