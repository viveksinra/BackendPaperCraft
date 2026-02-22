import { z } from "zod";

// ─── Create announcement ────────────────────────────────────────────────────

export const createAnnouncementSchema = z
  .object({
    audience: z.enum(["class", "organization"]),
    classId: z.string().length(24).optional(),
    title: z.string().min(1, "Title is required").max(300).trim(),
    body: z.string().min(1, "Body is required").max(10000),
    isPinned: z.boolean().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.audience === "class" && !data.classId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "classId is required when audience is 'class'",
        path: ["classId"],
      });
    }
  });
