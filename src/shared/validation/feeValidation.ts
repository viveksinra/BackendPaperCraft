import { z } from "zod";

// ─── Update fee ─────────────────────────────────────────────────────────────

export const updateFeeSchema = z.object({
  amount: z.number().min(0, "Amount must be >= 0").optional(),
  amountPaid: z.number().min(0, "Amount paid must be >= 0").optional(),
  notes: z.string().max(1000).optional(),
  dueDate: z.string().datetime().optional(),
});

// ─── Bulk update fees ───────────────────────────────────────────────────────

export const bulkUpdateFeesSchema = z.object({
  classId: z.string().length(24, "Invalid class ID"),
  amount: z.number().min(0, "Amount must be >= 0"),
  currency: z.enum(["GBP", "INR"]).optional(),
  dueDate: z.string().datetime().optional(),
});

// ─── Send reminder ──────────────────────────────────────────────────────────

export const sendReminderSchema = z.object({
  classId: z.string().length(24, "Invalid class ID"),
  studentUserIds: z.array(z.string().length(24)).optional(),
});
