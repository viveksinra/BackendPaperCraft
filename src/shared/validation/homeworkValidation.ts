import { z } from "zod";

// ─── Create homework ────────────────────────────────────────────────────────

export const createHomeworkSchema = z
  .object({
    classId: z.string().length(24, "Invalid class ID"),
    title: z.string().min(1, "Title is required").max(300).trim(),
    description: z.string().max(5000).optional(),
    type: z.enum(["test", "questions"]),
    testId: z.string().length(24).optional(),
    questionIds: z.array(z.string().length(24)).optional(),
    dueDate: z.string().datetime("Invalid due date"),
    lateSubmissionAllowed: z.boolean().optional(),
    lateDeadline: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "test" && !data.testId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "testId is required when type is 'test'",
        path: ["testId"],
      });
    }
    if (
      data.type === "questions" &&
      (!data.questionIds || data.questionIds.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questionIds are required when type is 'questions'",
        path: ["questionIds"],
      });
    }
    if (data.lateSubmissionAllowed && data.lateDeadline && data.dueDate) {
      if (new Date(data.lateDeadline) <= new Date(data.dueDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Late deadline must be after due date",
          path: ["lateDeadline"],
        });
      }
    }
  });

// ─── Update homework ────────────────────────────────────────────────────────

export const updateHomeworkSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(5000).optional(),
  dueDate: z.string().datetime().optional(),
  lateSubmissionAllowed: z.boolean().optional(),
  lateDeadline: z.string().datetime().optional(),
});

// ─── Submit homework ────────────────────────────────────────────────────────

export const submitHomeworkSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().length(24, "Invalid question ID"),
        answer: z.unknown(),
      })
    )
    .min(1, "At least one answer is required"),
});

// ─── Grade submission ───────────────────────────────────────────────────────

export const gradeSubmissionSchema = z.object({
  grades: z.array(
    z.object({
      questionId: z.string().length(24, "Invalid question ID"),
      marksAwarded: z.number().min(0, "Marks must be >= 0"),
      isCorrect: z.boolean(),
    })
  ),
  feedback: z.string().max(5000).optional(),
});
