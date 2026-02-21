import { Request, Response, NextFunction } from "express";

export function requireCompanyContext(req: Request, res: Response, next: NextFunction) {
  const candidate =
    (req.activeCompanyId as string | undefined) ||
    (req.body?.companyId as string | undefined) ||
    (req.query?.companyId as string | undefined) ||
    (req.params?.companyId as string | undefined) ||
    (req.params?.id as string | undefined);

  if (!candidate) {
    return res.status(400).sendEnvelope("active company required", "error");
  }

  if (!req.activeCompanyId) {
    req.activeCompanyId = candidate.toString();
  }

  return next();
}


