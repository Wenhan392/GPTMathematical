import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { checkoutPlans, normalizeQuantity, type PaidPlanId } from "../../../lib/plans";
import { requiredEnv, siteUrl } from "../../../lib/env";
import { getStripe, integrationIdentifier } from "../../../lib/stripe";
import { normalizeEmail } from "../../../lib/fulfillment";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { plan?: PaidPlanId; quantity?: number; email?: string };
    const plan = body.plan ? checkoutPlans[body.plan] : undefined;
    if (!plan) {
      return NextResponse.json({ error: "Unknown checkout plan." }, { status: 400 });
    }

    const quantity = normalizeQuantity(plan, body.quantity);
    const customerEmail = normalizeEmail(body.email);
    const baseUrl = siteUrl();
    const checkoutParams: Stripe.Checkout.SessionCreateParams & { integration_identifier: string } = {
      mode: plan.mode,
      line_items: [{
        price: requiredEnv(plan.priceEnv),
        quantity
      }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/#pricing`,
      allow_promotion_codes: true,
      customer_email: customerEmail || undefined,
      customer_creation: plan.mode === "payment" ? "always" : undefined,
      client_reference_id: plan.id,
      metadata: {
        plan: plan.id,
        quantity: String(quantity)
      },
      subscription_data: plan.mode === "subscription"
        ? {
            metadata: {
              plan: plan.id,
              quantity: String(quantity)
            }
          }
        : undefined,
      integration_identifier: integrationIdentifier
    };

    const session = await getStripe().checkout.sessions.create(checkoutParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create checkout session." },
      { status: 500 }
    );
  }
}
