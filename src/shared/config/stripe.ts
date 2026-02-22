import Stripe from "stripe";
import { env } from "./env";
import { logger } from "../logger";

/**
 * Stripe SDK client instance.
 *
 * PaperCraft uses Stripe Connect in "Standard" mode:
 * - The platform's Stripe account is the "platform" in Connect terminology.
 * - Each coaching institute (Company) has a "connected account" for receiving payouts.
 * - Payments flow through the platform with optional application_fee_amount for commission.
 */
let stripe: Stripe | null = null;

if (env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
} else {
  logger.warn({ msg: "STRIPE_SECRET_KEY not set; Stripe features disabled" });
}

export { stripe };
