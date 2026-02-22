import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

// ─── Create checkout session ────────────────────────────────────────────────

export const createCheckoutSessionSchema = z.object({
  productId: oid,
  studentUserId: oid.optional(),
  selectedAddOns: z
    .array(
      z.object({
        type: z.string().min(1),
        title: z.string().min(1),
        price: z.number().min(0),
      })
    )
    .optional(),
});

// ─── Free access claim ─────────────────────────────────────────────────────

export const freeAccessSchema = z.object({
  productId: oid,
  studentUserId: oid.optional(),
});
