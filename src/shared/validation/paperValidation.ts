import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ─── Paper schemas ───────────────────────────────────────────────────────────

const paperQuestionSchema = z.object({
  questionId:     z.string().regex(objectIdRegex),
  questionNumber: z.number().int().min(1),
  marks:          z.number().min(0).max(100),
  isRequired:     z.boolean().default(true),
});

const paperSectionSchema = z.object({
  name:         z.string().min(1).max(200),
  instructions: z.string().max(5000).default(""),
  timeLimit:    z.number().int().min(0).max(300).default(0),
  questions:    z.array(paperQuestionSchema).default([]),
});

export const createPaperSchema = z.object({
  title:       z.string().min(1).max(300).trim(),
  description: z.string().max(5000).optional(),
  templateId:  z.string().regex(objectIdRegex, "Invalid templateId"),
  sections:    z.array(paperSectionSchema).optional(),
});

export const updatePaperSchema = z.object({
  title:       z.string().min(1).max(300).trim().optional(),
  description: z.string().max(5000).optional(),
  templateId:  z.string().regex(objectIdRegex).optional(),
  sections:    z.array(paperSectionSchema).optional(),
  totalMarks:  z.number().int().min(0).optional(),
  totalTime:   z.number().int().min(0).optional(),
});

export const autoGenerateSchema = z.object({
  blueprintId:         z.string().regex(objectIdRegex, "Invalid blueprintId"),
  templateId:          z.string().regex(objectIdRegex, "Invalid templateId"),
  title:               z.string().min(1).max(300).trim(),
  description:         z.string().max(5000).optional(),
  overrideConstraints: z.object({
    excludeRecentlyUsed: z.boolean().optional(),
    recentlyUsedWindow:  z.number().int().min(1).max(365).optional(),
    excludeQuestionIds:  z.array(z.string().regex(objectIdRegex)).optional(),
    requireApprovedOnly: z.boolean().optional(),
  }).optional(),
});

export const swapQuestionSchema = z.object({
  sectionIndex:  z.number().int().min(0),
  questionNumber: z.number().int().min(1),
  newQuestionId: z.string().regex(objectIdRegex, "Invalid questionId"),
});

export const addQuestionSchema = z.object({
  sectionIndex: z.number().int().min(0),
  question:     paperQuestionSchema,
});

export const removeQuestionSchema = z.object({
  sectionIndex:   z.number().int().min(0),
  questionNumber: z.number().int().min(1),
});

export const listPapersQuerySchema = z.object({
  status:  z.enum(["draft", "finalized", "published"]).optional(),
  search:  z.string().max(200).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  sortBy:  z.enum(["createdAt", "title", "totalMarks", "updatedAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
