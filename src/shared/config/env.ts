import dotenv from "dotenv";
import dotenvSafe from "dotenv-safe";
import { z } from "zod";

// Load environment variables (fallback to plain dotenv if example file missing)
try {
  dotenvSafe.config({ example: ".env.example", allowEmptyValues: true });
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn("⚠️  dotenv-safe fallback:", (error as Error).message);
  dotenv.config();
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database -- auto-selects based on NODE_ENV
  MONGO_PRODUCTION_URI: z.string().optional(),
  MONGO_DEVELOPMENT_URI: z.string().optional(),
  // Canonical field; resolved from prod/dev URIs or legacy MONGO_URI
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  REDIS_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  SENTRY_DSN: z.string().optional().or(z.literal("")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_NAME: z.string().default("PaperCraft"),

  // CORS -- comma-separated origins for multi-frontend support
  CORS_ORIGIN: z.string().optional(),
  DEVELOPER_FRONTEND_URL: z.string().optional(),
  PARENT_CHILD_FRONTEND_URL: z.string().optional(),

  // Stripe (Phase 6)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_RETURN_URL: z.string().url().optional(),
  STRIPE_CONNECT_REFRESH_URL: z.string().url().optional(),
  STRIPE_PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(0),
  FRONTEND_CHECKOUT_SUCCESS_URL: z.string().url().optional(),
  FRONTEND_CHECKOUT_CANCEL_URL: z.string().url().optional(),

  // PDF generation (Phase 2)
  PDF_SERVICE_URL: z.string().optional(),
  PDF_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // AWS S3 (Phase 2)
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().default("eu-west-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

/**
 * Resolve the canonical MongoDB URI based on NODE_ENV.
 * Priority: explicit MONGODB_URI > prod/dev URI based on NODE_ENV > legacy MONGO_URI
 */
function resolveMongoUri(): string {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (process.env.MONGO_URI) return process.env.MONGO_URI;

  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
  if (nodeEnv === "production" && process.env.MONGO_PRODUCTION_URI) {
    return process.env.MONGO_PRODUCTION_URI;
  }
  if (process.env.MONGO_DEVELOPMENT_URI) {
    return process.env.MONGO_DEVELOPMENT_URI;
  }
  // Fallback to legacy inconsistent names from old .env
  if (process.env.MONGO_Production_URI) return process.env.MONGO_Production_URI;
  if (process.env.Mongo_Development_URI) return process.env.Mongo_Development_URI;

  return "";
}

export const env: AppEnv = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGO_PRODUCTION_URI: process.env.MONGO_PRODUCTION_URI,
  MONGO_DEVELOPMENT_URI: process.env.MONGO_DEVELOPMENT_URI,
  MONGODB_URI: resolveMongoUri(),
  REDIS_URL: process.env.REDIS_URL,
  SENTRY_DSN: process.env.SENTRY_DSN,
  LOG_LEVEL: process.env.LOG_LEVEL,
  APP_NAME: process.env.APP_NAME,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  DEVELOPER_FRONTEND_URL: process.env.DEVELOPER_FRONTEND_URL,
  PARENT_CHILD_FRONTEND_URL: process.env.PARENT_CHILD_FRONTEND_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_RETURN_URL: process.env.STRIPE_CONNECT_RETURN_URL,
  STRIPE_CONNECT_REFRESH_URL: process.env.STRIPE_CONNECT_REFRESH_URL,
  STRIPE_PLATFORM_FEE_PERCENT: process.env.STRIPE_PLATFORM_FEE_PERCENT,
  FRONTEND_CHECKOUT_SUCCESS_URL: process.env.FRONTEND_CHECKOUT_SUCCESS_URL,
  FRONTEND_CHECKOUT_CANCEL_URL: process.env.FRONTEND_CHECKOUT_CANCEL_URL,
  PDF_SERVICE_URL: process.env.PDF_SERVICE_URL,
  PDF_WORKER_CONCURRENCY: process.env.PDF_WORKER_CONCURRENCY,
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
  AWS_S3_REGION: process.env.AWS_S3_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
});
