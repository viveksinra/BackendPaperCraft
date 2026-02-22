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

export const createChildSchema = z
  .object({
    name: z.string().min(1).max(200).trim(),
    relationship: z.enum(["mother", "father", "guardian", "other"]),
    email: z.string().email().max(255).optional(),
    password: z.string().min(6).max(128).optional(),
    yearGroup: z.string().max(50).optional(),
    orgCode: z.string().min(1).max(50).optional(),
  })
  .refine(
    (data) => {
      // If email is provided, password must also be provided (and vice versa)
      if (data.email && !data.password) return false;
      if (data.password && !data.email) return false;
      return true;
    },
    { message: "Both email and password must be provided together" }
  );
