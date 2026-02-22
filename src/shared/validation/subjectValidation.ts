import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, "Invalid ObjectId");

const LEVELS = ["subject", "chapter", "topic", "subtopic"] as const;

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).trim(),
  level: z.enum(LEVELS),
  parentId: objectId.nullable().optional(),
  description: z.string().max(2000).optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const moveSubjectSchema = z.object({
  newParentId: objectId.nullable(),
  newSortOrder: z.number().int().min(0).optional(),
});

export const reorderSubjectsSchema = z.object({
  parentId: objectId.nullable(),
  orderedIds: z.array(objectId).min(1, "orderedIds must have at least 1 element"),
});
