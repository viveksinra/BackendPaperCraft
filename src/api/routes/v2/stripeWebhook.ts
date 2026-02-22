import { Router, Request, Response } from "express";
import express from "express";
import { handleWebhook } from "../../../services/stripeWebhookService";
import { logger } from "../../../shared/logger";

export const stripeWebhookV2Router = Router();

// POST /api/v2/webhooks/stripe
// CRITICAL: Uses express.raw() for Stripe signature verification.
// This route MUST NOT use the standard JSON body parser.
stripeWebhookV2Router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) {
        return res.status(400).sendEnvelope("missing stripe-signature header", "error");
      }

      const result = await handleWebhook(req.body as Buffer, signature);
      return res.status(200).json(result);
    } catch (err: any) {
      logger.error({
        msg: "Stripe webhook error",
        error: err.message,
      });

      if (err.type === "StripeSignatureVerificationError") {
        return res.status(400).sendEnvelope("invalid webhook signature", "error");
      }
      return res.status(400).sendEnvelope(err.message, "error");
    }
  }
);
