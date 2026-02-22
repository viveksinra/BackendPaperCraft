import { Request, Response, NextFunction } from "express";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "Models", "Membership"));

type AuthedRequest = Request & { auth?: { sub?: string } };

/**
 * Middleware factory: requires the authenticated user to have the specified role
 * (or higher) in the current company context.
 */
export function ensureRole(...roles: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const email = req.auth?.sub;
    if (!email) {
      return res.status(401).sendEnvelope("authentication required", "error");
    }

    const companyId = req.params.companyId || req.activeCompanyId;
    if (!companyId) {
      return res.status(400).sendEnvelope("company context required", "error");
    }

    try {
      const membership = await Membership.findOne({ companyId, userEmail: email });
      if (!membership) {
        return res.status(403).sendEnvelope("not a member of this company", "error");
      }

      // Role hierarchy: owner > admin > senior_teacher > teacher > content_reviewer
      const ROLE_HIERARCHY: Record<string, string[]> = {
        owner: ["admin", "senior_teacher", "teacher", "content_reviewer"],
        admin: ["senior_teacher", "teacher", "content_reviewer"],
        senior_teacher: ["teacher", "content_reviewer"],
      };
      const effectiveRoles = new Set([membership.role, ...(ROLE_HIERARCHY[membership.role] || [])]);

      const hasRole = roles.some((r) => effectiveRoles.has(r));
      if (!hasRole) {
        return res
          .status(403)
          .sendEnvelope(`requires one of: ${roles.join(", ")}`, "error");
      }

      return next();
    } catch {
      return res.status(500).sendEnvelope("failed to verify role", "error");
    }
  };
}
