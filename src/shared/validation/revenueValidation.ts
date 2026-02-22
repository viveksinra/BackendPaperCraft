import { z } from "zod";

// ─── Date range filter ─────────────────────────────────────────────────────

export const dateRangeSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) > new Date(data.startDate);
      }
      return true;
    },
    { message: "endDate must be after startDate", path: ["endDate"] }
  );

// ─── Time series query ─────────────────────────────────────────────────────

export const timeSeriesSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  granularity: z.enum(["day", "week", "month"]).default("month"),
});
