import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ─── Student-facing test-taking schemas ─────────────────────────────────────

export const submitAnswerSchema = z.object({
  questionId: z.string().min(1).regex(objectIdRegex, "Invalid questionId"),
  answer: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
    z.record(z.string(), z.string()),
    z.null(),
  ]),
});

export const flagQuestionSchema = z.object({
  questionId: z.string().min(1).regex(objectIdRegex, "Invalid questionId"),
  flagged: z.boolean(),
});

// ─── Teacher-facing grading schemas ─────────────────────────────────────────

export const gradeAnswerSchema = z.object({
  attemptId: z.string().min(1).regex(objectIdRegex, "Invalid attemptId"),
  questionId: z.string().min(1).regex(objectIdRegex, "Invalid questionId"),
  marks: z.number().min(0),
  feedback: z.string().max(5000).optional(),
});

export const bulkGradeSchema = z.object({
  questionId: z.string().min(1).regex(objectIdRegex, "Invalid questionId"),
  grades: z
    .array(
      z.object({
        attemptId: z
          .string()
          .min(1)
          .regex(objectIdRegex, "Invalid attemptId"),
        marks: z.number().min(0),
        feedback: z.string().max(5000).optional(),
      })
    )
    .min(1, "At least one grade entry is required"),
});

export const extendTimeSchema = z.object({
  additionalMinutes: z.number().int().min(1).max(120),
});
