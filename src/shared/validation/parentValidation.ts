import { z } from "zod";

export const parentSignupSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200).trim(),
});

export const linkChildSchema = z.object({
  studentCode: z.string().min(1).max(20).trim().toUpperCase(),
  relationship: z
    .enum(["mother", "father", "guardian", "other"])
    .default("guardian"),
});
