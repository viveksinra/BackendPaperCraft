import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

// ─── Course Schemas ───────────────────────────────────────────────────────

const pricingInput = z.object({
  isFree: z.boolean().default(true),
  price: z.number().min(0).default(0),
  currency: z.enum(["GBP", "INR"]).default("GBP"),
});

export const createCourseSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  teacherId: oid,
  description: z.string().max(10000).optional(),
  shortDescription: z.string().max(500).optional(),
  thumbnail: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "all_levels"]).optional(),
  targetExamType: z.string().max(100).optional(),
  pricing: pricingInput.optional(),
  welcomeMessage: z.string().max(2000).optional(),
  completionMessage: z.string().max(2000).optional(),
  certificateEnabled: z.boolean().optional(),
});

export const updateCourseSchema = z.object({
  title: z.string().min(3).max(200).trim().optional(),
  description: z.string().max(10000).optional(),
  shortDescription: z.string().max(500).optional(),
  thumbnail: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "all_levels"]).optional(),
  targetExamType: z.string().max(100).optional(),
  pricing: pricingInput.optional(),
  welcomeMessage: z.string().max(2000).optional(),
  completionMessage: z.string().max(2000).optional(),
  certificateEnabled: z.boolean().optional(),
  additionalTeacherIds: z.array(oid).max(20).optional(),
});

// ─── Section Schemas ──────────────────────────────────────────────────────

export const addSectionSchema = z.object({
  title: z.string().min(1).max(200).trim(),
});

export const updateSectionSchema = z.object({
  title: z.string().min(1).max(200).trim(),
});

export const reorderSectionsSchema = z.object({
  sectionOrder: z.array(oid).min(1),
});

// ─── Lesson Schemas ───────────────────────────────────────────────────────

export const addLessonSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  type: z.enum(["video", "pdf", "text", "quiz", "resource"]),
  isFree: z.boolean().optional(),
  dripDate: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().min(0).max(600).optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  type: z.enum(["video", "pdf", "text", "quiz", "resource"]).optional(),
  isFree: z.boolean().optional(),
  dripDate: z.string().datetime().nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(600).optional(),
  isPublished: z.boolean().optional(),
});

export const reorderLessonsSchema = z.object({
  lessonOrder: z.array(oid).min(1),
});

export const moveLessonSchema = z.object({
  fromSectionId: oid,
  toSectionId: oid,
  newOrder: z.number().int().min(0),
});

// ─── Content Schemas ──────────────────────────────────────────────────────

export const setVideoContentSchema = z.object({
  videoUrl: z.string().min(1).max(2000),
  videoDuration: z.number().min(0).optional(),
  videoThumbnailUrl: z.string().max(2000).optional(),
});

export const setPdfContentSchema = z.object({
  pdfUrl: z.string().min(1).max(2000),
  pdfPageCount: z.number().int().min(0).optional(),
});

export const setTextContentSchema = z.object({
  textContent: z.string().min(1).max(50000),
});

export const setQuizContentSchema = z.object({
  testId: oid,
});

export const setResourceContentSchema = z.object({
  resourceFiles: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        url: z.string().min(1).max(2000),
        fileSize: z.number().min(0).max(524288000),
        mimeType: z.string().min(1).max(100),
      })
    )
    .min(1)
    .max(20),
});

// ─── Catalog Schema ───────────────────────────────────────────────────────

export const browseCatalogSchema = z.object({
  category: z.string().max(100).optional(),
  level: z.enum(["beginner", "intermediate", "advanced", "all_levels"]).optional(),
  examType: z.string().max(100).optional(),
  isFree: z.enum(["true", "false"]).optional(),
  search: z.string().max(200).optional(),
  sortBy: z
    .enum(["newest", "popular", "rating", "price_asc", "price_desc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// ─── Enrollment Schemas ───────────────────────────────────────────────────

export const enrollSchema = z.object({
  purchaseId: oid.optional(),
  studentUserId: oid.optional(),
});

export const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().max(2000).optional(),
});

export const trackTimeSchema = z.object({
  lessonId: oid,
  additionalSeconds: z.number().int().min(1).max(3600),
});

export const markLessonCompleteSchema = z.object({
  lessonId: oid,
  sectionId: oid,
  quizScore: z.number().min(0).max(100).optional(),
});

export const markLessonIncompleteSchema = z.object({
  lessonId: oid,
});

export const updateCurrentLessonSchema = z.object({
  sectionId: oid,
  lessonId: oid,
});

// ─── Upload Schemas ───────────────────────────────────────────────────────

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().min(1),
  uploadType: z.enum(["video", "pdf", "resource", "thumbnail"]),
});

export const confirmUploadSchema = z.object({
  fileKey: z.string().min(1).max(1000),
  uploadType: z.enum(["video", "pdf", "resource", "thumbnail"]),
  lessonId: oid.optional(),
});
