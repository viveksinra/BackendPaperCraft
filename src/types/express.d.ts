import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    tenantId?: string;
    basePath?: string;
    activeCompanyId?: string;
    auth?: {
      sub: string;
      tenantId?: string;
      roles?: string[];
      [key: string]: unknown;
    };
  }

  interface Response {
    sendEnvelope(message: string, variant: "success" | "error" | "info", myData?: unknown): Response;
    ok(message?: string, myData?: unknown): Response;
    info(message?: string, myData?: unknown): Response;
    fail(code: string, messageOrData?: unknown, options?: Record<string, unknown>): Response;
    success(data?: unknown, message?: string, meta?: Record<string, unknown>): Response;
  }
}


