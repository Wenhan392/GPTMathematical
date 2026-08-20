import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requiredEnv } from "../../../../lib/env";
import { fulfillCheckoutSession, updateSubscriptionLicense } from "../../../../lib/fulfillment";
import { getStripe } from "../../../../lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  const payload = await request.text();

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await updateSubscriptionLicense(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook fulfillment failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
