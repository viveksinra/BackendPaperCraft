import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const TEST_MODES = [
  "live_mock",
  "anytime_mock",
  "practice",
  "classroom",
  "section_timed",
] as const;

// ─── Sub-schemas ────────────────────────────────────────────────────────────

export const testSectionSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  questionIds: z
    .array(z.string().regex(objectIdRegex, "Invalid questionId"))
    .min(1, "Section must have at least 1 question"),
  timeLimit: z.number().int().min(0).max(300).default(0),
  instructions: z.string().max(5000).default(""),
  canGoBack: z.boolean().default(true),
});

const schedulingSchema = z.object({
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
  availableFrom: z.string().datetime().optional().nullable(),
  duration: z.number().int().min(0).max(600).optional(),
});

const optionsSchema = z.object({
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
  showResultsAfterCompletion: z.boolean().default(true),
  showSolutionsAfterCompletion: z.boolean().default(false),
  showResultsToParents: z.boolean().default(true),
  instantFeedback: z.boolean().default(false),
  allowReview: z.boolean().default(true),
  maxAttempts: z.number().int().min(1).default(1),
  passingScore: z.number().min(0).max(100).default(40),
});

const assignmentSchema = z.object({
  classIds: z.array(z.string().regex(objectIdRegex)).default([]),
  studentIds: z.array(z.string().regex(objectIdRegex)).default([]),
  isPublic: z.boolean().default(false),
});

const gradingSchema = z.object({
  requireManualGrading: z.boolean().default(false),
  gradingDeadline: z.string().datetime().optional().nullable(),
});

// ─── Create schema with mode-specific refinements ───────────────────────────

export const createOnlineTestSchema = z
  .object({
    title: z.string().min(1).max(300).trim(),
    description: z.string().max(5000).optional(),
    mode: z.enum(TEST_MODES),
    paperId: z.string().regex(objectIdRegex).optional().nullable(),
    scheduling: schedulingSchema.optional(),
    sections: z
      .array(testSectionSchema)
      .min(1, "At least 1 section is required"),
    options: optionsSchema.optional(),
    assignment: assignmentSchema.optional(),
    grading: gradingSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const { mode, scheduling, sections, options } = data;

    // live_mock: startTime and duration required
    if (mode === "live_mock") {
      if (!scheduling?.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Live mock tests require a startTime in scheduling",
          path: ["scheduling", "startTime"],
        });
      } else {
        const start = new Date(scheduling.startTime);
        if (start <= new Date()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "startTime must be in the future for live mock tests",
            path: ["scheduling", "startTime"],
          });
        }
      }
      if (!scheduling?.duration || scheduling.duration <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Live mock tests require a positive duration in scheduling",
          path: ["scheduling", "duration"],
        });
      }
    }

    // anytime_mock: availableFrom and endTime required, availableFrom < endTime
    if (mode === "anytime_mock") {
      if (!scheduling?.availableFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Anytime mock tests require availableFrom in scheduling",
          path: ["scheduling", "availableFrom"],
        });
      }
      if (!scheduling?.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Anytime mock tests require endTime in scheduling",
          path: ["scheduling", "endTime"],
        });
      }
      if (scheduling?.availableFrom && scheduling?.endTime) {
        if (
          new Date(scheduling.availableFrom) >= new Date(scheduling.endTime)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "availableFrom must be before endTime",
            path: ["scheduling", "availableFrom"],
          });
        }
      }
    }

    // section_timed: all sections must have timeLimit > 0
    if (mode === "section_timed") {
      for (let i = 0; i < sections.length; i++) {
        if (!sections[i].timeLimit || sections[i].timeLimit <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section ${i + 1} must have a timeLimit > 0 for section-timed mode`,
            path: ["sections", i, "timeLimit"],
          });
        }
      }
      // Auto-set canGoBack to false for section-timed
      for (const section of sections) {
        section.canGoBack = false;
      }
    }

    // practice: auto-set maxAttempts and instantFeedback
    if (mode === "practice" && options) {
      (options as Record<string, unknown>).maxAttempts = 999;
      (options as Record<string, unknown>).instantFeedback = true;
    }

    // classroom: auto-set isPublic to false
    if (mode === "classroom" && data.assignment) {
      (data.assignment as Record<string, unknown>).isPublic = false;
    }
  });

// ─── Update schema (all fields optional) ───────────────────────────────────

export const updateOnlineTestSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(5000).optional(),
  mode: z.enum(TEST_MODES).optional(),
  paperId: z.string().regex(objectIdRegex).optional().nullable(),
  scheduling: schedulingSchema.optional(),
  sections: z.array(testSectionSchema).min(1).optional(),
  options: optionsSchema.partial().optional(),
  assignment: assignmentSchema.partial().optional(),
  grading: gradingSchema.partial().optional(),
});
