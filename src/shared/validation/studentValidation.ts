import { z } from "zod";

export const studentSignupSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200).trim(),
  orgCode: z.string().min(1).max(50).trim().toUpperCase(),
});

export const joinOrgSchema = z.object({
  orgCode: z.string().min(1).max(50).trim().toUpperCase(),
});

export const updateStudentProfileSchema = z.object({
  dateOfBirth: z.string().datetime().optional(),
  yearGroup: z.string().max(50).optional(),
  school: z.string().max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  preferences: z
    .object({
      showTimerWarning: z.boolean().optional(),
      questionFontSize: z.enum(["small", "medium", "large"]).optional(),
      highContrastMode: z.boolean().optional(),
    })
    .optional(),
});
