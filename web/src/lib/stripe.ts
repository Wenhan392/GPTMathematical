import Stripe from "stripe";
import { requiredEnv } from "./env";

export function getStripe() {
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-07-29.dahlia" as Stripe.StripeConfig["apiVersion"]
  });
}

export const integrationIdentifier = "gpt_math_launch_xkqtrvza";
