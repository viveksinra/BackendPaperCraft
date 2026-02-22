import { z } from "zod";

// ─── Generate report ────────────────────────────────────────────────────────

export const generateReportSchema = z
  .object({
    type: z.enum([
      "progress_report",
      "mock_analysis",
      "class_summary",
      "custom",
    ]),
    studentUserId: z
      .string()
      .length(24)
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional(),
    classId: z
      .string()
      .length(24)
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional(),
    templateId: z
      .enum(["standard", "eleven_plus", "custom"])
      .default("standard"),
    dateRange: z
      .object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.type === "progress_report" ||
        data.type === "mock_analysis"
      ) {
        return !!data.studentUserId;
      }
      return true;
    },
    {
      message:
        "studentUserId is required for progress_report and mock_analysis",
      path: ["studentUserId"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "class_summary") {
        return !!data.classId;
      }
      return true;
    },
    {
      message: "classId is required for class_summary",
      path: ["classId"],
    }
  );

export type GenerateReportInput = z.infer<typeof generateReportSchema>;

// ─── Bulk generate ──────────────────────────────────────────────────────────

export const bulkGenerateSchema = z.object({
  classId: z
    .string()
    .length(24)
    .regex(/^[0-9a-fA-F]{24}$/),
  templateId: z
    .enum(["standard", "eleven_plus", "custom"])
    .default("standard"),
  dateRange: z
    .object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    })
    .optional(),
});

export type BulkGenerateInput = z.infer<typeof bulkGenerateSchema>;
