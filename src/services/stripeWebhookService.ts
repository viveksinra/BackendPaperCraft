import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe as _stripe } from "../shared/config/stripe";
import { env } from "../shared/config/env";

function requireStripe() {
  if (!_stripe) throw Object.assign(new Error("Stripe not configured"), { status: 503 });
  return _stripe;
}
import { PurchaseModel } from "../models/purchase";
import { grantAccess, revokeAccess } from "./purchaseService";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

const Company = mongoose.model("Company");

// ─── Main webhook handler ───────────────────────────────────────────────────

export async function handleWebhook(
  rawBody: Buffer,
  stripeSignature: string
): Promise<{ received: true }> {
  const event = requireStripe().webhooks.constructEvent(
    rawBody,
    stripeSignature,
    env.STRIPE_WEBHOOK_SECRET || ""
  );

  logger.info({
    msg: "Stripe webhook received",
    eventType: event.type,
    eventId: event.id,
  });

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    case "account.updated":
      await handleAccountUpdated(event.data.object, event.account);
      break;
    default:
      logger.info({ msg: "Unhandled webhook event type", eventType: event.type });
  }

  return { received: true };
}

// ─── checkout.session.completed ─────────────────────────────────────────────

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const purchaseId = session.metadata?.purchaseId;
  if (!purchaseId) {
    logger.warn({ msg: "checkout.session.completed missing purchaseId in metadata" });
    return;
  }

  const purchase = await PurchaseModel.findById(purchaseId);
  if (!purchase) {
    logger.warn({ msg: "Purchase not found for checkout session", purchaseId });
    return;
  }

  // Idempotency: already completed
  if (purchase.status === "completed") {
    logger.info({ msg: "Purchase already completed, skipping", purchaseId });
    return;
  }

  if (session.payment_status === "paid") {
    purchase.status = "completed";
    purchase.completedAt = new Date();
    const piId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id;
    if (piId) purchase.stripePaymentIntentId = piId;

    // Try to get receipt URL from charge
    if (piId) {
      try {
        const pi = await requireStripe().paymentIntents.retrieve(piId, {
          expand: ["latest_charge"],
        });
        const charge = pi.latest_charge as Stripe.Charge | null;
        if (charge) {
          purchase.stripeChargeId = charge.id || "";
          purchase.receiptUrl = charge.receipt_url || "";
        }
      } catch (err) {
        logger.warn({
          msg: "Failed to retrieve charge for receipt URL",
          error: (err as Error).message,
        });
      }
    }

    await purchase.save();
    await grantAccess(String(purchase._id));

    logger.info({
      msg: "Checkout session completed - access granted",
      purchaseId,
      productTitle: purchase.productTitle,
    });
  } else {
    logger.info({
      msg: "Checkout session completed but payment not yet confirmed",
      purchaseId,
      paymentStatus: session.payment_status,
    });
  }
}

// ─── payment_intent.succeeded ───────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const paymentIntentId = pi.id;

  const purchase = await PurchaseModel.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!purchase) {
    logger.info({ msg: "No purchase found for payment_intent.succeeded", paymentIntentId });
    return;
  }

  // Idempotency
  if (purchase.status === "completed") return;

  purchase.status = "completed";
  purchase.completedAt = new Date();
  await purchase.save();

  await grantAccess(String(purchase._id));

  logger.info({
    msg: "Payment intent succeeded - access granted",
    purchaseId: String(purchase._id),
  });
}

// ─── payment_intent.payment_failed ──────────────────────────────────────────

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const paymentIntentId = pi.id;

  const purchase = await PurchaseModel.findOne({ stripePaymentIntentId: paymentIntentId });
  if (!purchase) {
    logger.info({ msg: "No purchase found for payment_intent.payment_failed", paymentIntentId });
    return;
  }

  purchase.status = "failed";
  purchase.failedAt = new Date();
  purchase.failureReason = pi.last_payment_error?.message || "Payment failed";
  await purchase.save();

  // Notify student
  try {
    await addNotificationJob({
      type: "payment_failed",
      recipientUserIds: [purchase.studentUserId.toString()],
      title: "Payment Failed",
      body: `Payment for "${purchase.productTitle}" could not be processed.`,
      referenceType: "purchase",
      referenceId: String(purchase._id),
      companyId: purchase.companyId.toString(),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue payment failure notification", error: (err as Error).message });
  }

  logger.info({
    msg: "Payment intent failed",
    purchaseId: String(purchase._id),
    reason: purchase.failureReason,
  });
}

// ─── charge.refunded ────────────────────────────────────────────────────────

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const chargeId = charge.id;

  const purchase = await PurchaseModel.findOne({ stripeChargeId: chargeId });
  if (!purchase) {
    logger.info({ msg: "No purchase found for charge.refunded", chargeId });
    return;
  }

  await revokeAccess(String(purchase._id), "refunded");

  // Notify student
  try {
    await addNotificationJob({
      type: "purchase_refunded",
      recipientUserIds: [purchase.studentUserId.toString()],
      title: "Refund Processed",
      body: `Your purchase of "${purchase.productTitle}" has been refunded.`,
      referenceType: "purchase",
      referenceId: String(purchase._id),
      companyId: purchase.companyId.toString(),
    });
  } catch (err) {
    logger.warn({ msg: "Failed to queue refund notification", error: (err as Error).message });
  }

  logger.info({
    msg: "Charge refunded - access revoked",
    purchaseId: String(purchase._id),
    chargeId,
  });
}

// ─── account.updated (Connect) ──────────────────────────────────────────────

async function handleAccountUpdated(account: Stripe.Account, accountId?: string): Promise<void> {
  const acctId = accountId || account.id;
  if (!acctId) return;

  const company = await Company.findOne({ stripeAccountId: acctId });
  if (!company) {
    logger.info({ msg: "No company found for account.updated", accountId: acctId });
    return;
  }

  const payoutsEnabled = account.payouts_enabled ?? false;
  const chargesEnabled = account.charges_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;

  let derivedStatus = "pending";
  if (payoutsEnabled && chargesEnabled) {
    derivedStatus = "active";
  } else if (detailsSubmitted && !payoutsEnabled) {
    derivedStatus = "restricted";
  }

  await Company.findByIdAndUpdate(company._id, {
    stripeOnboardingComplete: detailsSubmitted,
    stripePayoutsEnabled: payoutsEnabled,
    stripeChargesEnabled: chargesEnabled,
    stripeAccountStatus: derivedStatus,
  });

  logger.info({
    msg: "Stripe account updated via webhook",
    companyId: company._id.toString(),
    accountId: acctId,
    status: derivedStatus,
  });
}
