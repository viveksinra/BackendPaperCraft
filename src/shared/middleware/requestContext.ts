import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header("x-request-id");
  const requestId = incomingId && incomingId.length > 0 ? incomingId : nanoid(12);
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  const tenantHeader = req.header("x-tenant-id");
  if (tenantHeader) {
    res.locals.tenantId = tenantHeader;
    req.tenantId = tenantHeader;
  }

  next();
}




