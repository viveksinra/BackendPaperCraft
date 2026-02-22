import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// ─── Create class ───────────────────────────────────────────────────────────

export const createClassSchema = z.object({
  name: z.string().min(1, "Class name is required").max(200).trim(),
  description: z.string().max(2000).optional(),
  yearGroup: z.string().max(50).optional(),
  subject: z.string().max(100).optional(),
  schedule: z
    .object({
      dayOfWeek: z.array(z.enum(WEEKDAYS)).optional(),
      time: z.string().max(50).optional(),
      location: z.string().max(200).optional(),
    })
    .optional(),
});

// ─── Update class ───────────────────────────────────────────────────────────

export const updateClassSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  yearGroup: z.string().max(50).optional(),
  subject: z.string().max(100).optional(),
  schedule: z
    .object({
      dayOfWeek: z.array(z.enum(WEEKDAYS)).optional(),
      time: z.string().max(50).optional(),
      location: z.string().max(200).optional(),
    })
    .optional(),
  status: z.enum(["active", "archived"]).optional(),
});

// ─── Add students ───────────────────────────────────────────────────────────

export const addStudentsSchema = z.object({
  studentUserIds: z
    .array(z.string().length(24, "Invalid student ID"))
    .min(1, "At least one student is required")
    .max(100, "Maximum 100 students at a time"),
});

// ─── Add teacher ────────────────────────────────────────────────────────────

export const addTeacherSchema = z.object({
  teacherUserId: z.string().regex(objectIdRegex, "Invalid teacher ID"),
});
