import type { Request, Response, NextFunction } from "express";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "utils", "auth"));

const attachAuthFromCookie: (req: Request) => unknown = legacyAuth.attachAuthFromCookie;
const getCookie: (req: Request, name: string) => string | null = legacyAuth.getCookie;

export function authContext(req: Request, _res: Response, next: NextFunction) {
  attachAuthFromCookie(req);
  const headerCompany = req.header("x-company-id");
  const activeFromCookie = getCookie(req, "active_company");
  const active = headerCompany || activeFromCookie;
  if (active) {
    req.activeCompanyId = String(active);
  }
  next();
}





