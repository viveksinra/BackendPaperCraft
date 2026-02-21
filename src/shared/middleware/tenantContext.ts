import type { Request, Response, NextFunction } from "express";

export function tenantContext(req: Request, res: Response, next: NextFunction) {
  const headerTenant = req.header("x-tenant-id");
  const host = (req.header("x-forwarded-host") || req.header("host") || "").toString().toLowerCase();

  let tenantId = headerTenant?.trim();

  if (!tenantId) {
    if (host.includes("localhost")) {
      tenantId = "devTenant";
    } else if (host) {
      tenantId = host.split(":")[0];
    }
  }

  req.tenantId = tenantId && tenantId.length > 0 ? tenantId : "unknownTenant";
  res.locals.tenantId = req.tenantId;
  res.setHeader("X-Tenant-ID", req.tenantId);
  req.basePath = process.env.BASE_PATH || "/blog";

  next();
}





