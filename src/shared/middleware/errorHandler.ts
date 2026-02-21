import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Zod validation errors
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(
      err.issues.reduce<Map<string, string[]>>((map, issue) => {
        const key = issue.path.join(".") || "_error";
        const arr = map.get(key) ?? [];
        arr.push(issue.message);
        map.set(key, arr);
        return map;
      }, new Map())
    );
    return res.fail("VALIDATION_ERROR", "Invalid request", { status: 422, fields });
  }

  // Generic errors
  const asErr = err as Error | undefined;
  logger.error({ msg: "Unhandled error", err: asErr });
  return res.fail("INTERNAL_ERROR", asErr?.message || "Something went wrong", { status: 500 });
}




