import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

const attachmentSchema = z.object({
  name: z.string().min(1).max(300),
  url: z.string().min(1).max(2000),
  fileSize: z.number().min(0).max(52428800), // 50MB
  mimeType: z.string().min(1).max(100),
});

export const sendMessageSchema = z.object({
  recipientId: oid,
  recipientRole: z.enum(["teacher", "student", "parent", "admin"]),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(10000),
  attachments: z.array(attachmentSchema).max(5).optional(),
  parentMessageId: oid.optional(),
});

export const getConversationMessagesSchema = z.object({
  otherUserId: oid,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const listConversationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchMessagesSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const markConversationReadSchema = z.object({
  otherUserId: oid,
});
