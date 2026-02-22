import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

const pricingSchema = z.object({
  currency: z.enum(["GBP", "INR"]).default("GBP"),
  basePrice: z.number().min(0),
  discountPrice: z.number().min(0).optional(),
  discountValidUntil: z.string().datetime().optional(),
  isFree: z.boolean().default(false),
});

const addOnSchema = z.object({
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price: z.number().min(0),
});

const bundleItemSchema = z.object({
  productId: oid,
  referenceType: z.string().min(1),
  referenceId: oid,
  title: z.string().min(1),
});

export const createProductSchema = z
  .object({
    type: z.enum([
      "paper",
      "paper_set",
      "test",
      "course",
      "bundle",
      "add_on_service",
    ]),
    referenceId: oid.optional(),
    title: z.string().min(1).max(300).trim(),
    description: z.string().max(10000).optional(),
    thumbnail: z.string().url().optional(),
    pricing: pricingSchema.optional(),
    addOns: z.array(addOnSchema).optional(),
    bundleItems: z.array(bundleItemSchema).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    category: z.string().max(100).optional(),
    yearGroup: z.string().max(50).optional(),
    subject: z.string().max(100).optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "bundle" && !data.referenceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "referenceId is required for non-bundle product types",
        path: ["referenceId"],
      });
    }
    if (
      data.type === "bundle" &&
      (!data.bundleItems || data.bundleItems.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bundleItems are required for bundle products",
        path: ["bundleItems"],
      });
    }
    if (data.pricing) {
      if (
        data.pricing.discountPrice !== undefined &&
        data.pricing.discountPrice >= data.pricing.basePrice
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "discountPrice must be less than basePrice",
          path: ["pricing", "discountPrice"],
        });
      }
      if (
        data.pricing.discountPrice !== undefined &&
        !data.pricing.discountValidUntil
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "discountValidUntil is required when discountPrice is provided",
          path: ["pricing", "discountValidUntil"],
        });
      }
    }
  });

export const updateProductSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(10000).optional(),
  thumbnail: z.string().url().optional(),
  pricing: pricingSchema.optional(),
  addOns: z.array(addOnSchema).optional(),
  bundleItems: z.array(bundleItemSchema).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  category: z.string().max(100).optional(),
  yearGroup: z.string().max(50).optional(),
  subject: z.string().max(100).optional(),
  sortOrder: z.number().int().optional(),
});
