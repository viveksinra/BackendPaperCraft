import { z } from "zod";

const oid = z.string().length(24).regex(/^[0-9a-fA-F]{24}$/);

const notificationCategories = [
  "messaging",
  "homework",
  "fees",
  "announcements",
  "tests",
  "discussions",
  "gamification",
  "courses",
  "payments",
  "system",
] as const;

export const listNotificationsSchema = z.object({
  category: z.enum(notificationCategories).optional(),
  isRead: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const markAllReadSchema = z.object({
  category: z.enum(notificationCategories).optional(),
});

export const updatePreferencesSchema = z.object({
  globalEnabled: z.boolean().optional(),
  emailDigestFrequency: z
    .enum(["instant", "hourly", "daily", "weekly", "none"])
    .optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
    .optional(),
  categories: z
    .array(
      z.object({
        category: z.enum(notificationCategories),
        enabled: z.boolean().optional(),
        channels: z
          .array(z.enum(["in_app", "email", "push"]))
          .min(0)
          .max(3)
          .optional(),
      })
    )
    .optional(),
});
