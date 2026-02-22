import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

export const createThreadSchema = z.object({
  title: z.string().min(3).max(500).trim(),
  body: z.string().min(1).max(20000),
  category: z
    .enum(["general", "homework", "test", "course", "announcement", "question", "feedback"])
    .optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  classId: oid.optional(),
  courseId: oid.optional(),
});

export const updateThreadSchema = z.object({
  title: z.string().min(3).max(500).trim().optional(),
  body: z.string().min(1).max(20000).optional(),
  category: z
    .enum(["general", "homework", "test", "course", "announcement", "question", "feedback"])
    .optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const createReplySchema = z.object({
  body: z.string().min(1).max(10000),
  parentReplyId: oid.optional(),
});

export const editReplySchema = z.object({
  body: z.string().min(1).max(10000),
});

export const listThreadsSchema = z.object({
  category: z
    .enum(["general", "homework", "test", "course", "announcement", "question", "feedback"])
    .optional(),
  classId: oid.optional(),
  courseId: oid.optional(),
  authorId: oid.optional(),
  status: z.enum(["open", "closed", "pinned", "archived"]).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["newest", "popular", "most_replies", "most_upvotes"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const listRepliesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
