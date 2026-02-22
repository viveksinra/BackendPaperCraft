import { Request, Response, NextFunction } from "express";
import path from "path";
import { ParentLinkModel } from "../../models/parentLink";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "Models", "Membership"));

type AuthedRequest = Request & { auth?: { sub?: string }; parentLink?: any };

/**
 * Middleware: requires the authenticated user to have a "student" membership
 * in at least one organization.
 */
export function isStudent(req: AuthedRequest, res: Response, next: NextFunction) {
  const email = req.auth?.sub;
  if (!email) {
    return res.status(401).sendEnvelope("authentication required", "error");
  }

  Membership.findOne({ userEmail: email, role: "student" })
    .then((membership: any) => {
      if (!membership) {
        return res.status(403).sendEnvelope("student role required", "error");
      }
      next();
    })
    .catch((err: Error) => {
      return res.status(500).sendEnvelope("failed to verify role", "error");
    });
}

/**
 * Middleware: requires the authenticated user to have a "parent" membership
 * in at least one organization OR have registered as a parent.
 */
export function isParent(req: AuthedRequest, res: Response, next: NextFunction) {
  const email = req.auth?.sub;
  if (!email) {
    return res.status(401).sendEnvelope("authentication required", "error");
  }

  // Parents may not have a membership initially (they link through children),
  // so we check for any active ParentLink OR a parent membership.
  const User = require(path.join(__dirname, "..", "..", "..", "Models", "User"));

  User.findOne({ email })
    .then((user: any) => {
      if (!user) {
        return res.status(403).sendEnvelope("parent role required", "error");
      }

      return ParentLinkModel.findOne({
        parentUserId: user._id,
        status: { $in: ["active", "pending"] },
      }).then((link: any) => {
        if (link) {
          return next();
        }

        // Also check membership-based role
        return Membership.findOne({ userEmail: email, role: "parent" }).then(
          (membership: any) => {
            if (!membership) {
              // Allow newly registered parents who haven't linked yet
              if (user.registeredAs === "parent") {
                return next();
              }
              // Check if user was registered as parent (has at least one ParentLink ever)
              return ParentLinkModel.findOne({ parentUserId: user._id }).then(
                (anyLink: any) => {
                  if (anyLink) {
                    return next();
                  }
                  return res
                    .status(403)
                    .sendEnvelope("parent role required", "error");
                }
              );
            }
            next();
          }
        );
      });
    })
    .catch((err: Error) => {
      return res.status(500).sendEnvelope("failed to verify role", "error");
    });
}

/**
 * Middleware: validates that the authenticated parent has an active ParentLink
 * to the child specified in req.params.childId or req.params.childStudentId.
 * Attaches the validated ParentLink to req.parentLink.
 */
export function isParentOf(req: AuthedRequest, res: Response, next: NextFunction) {
  const email = req.auth?.sub;
  if (!email) {
    return res.status(401).sendEnvelope("authentication required", "error");
  }

  const childId = req.params.childId || req.params.childStudentId;
  if (!childId) {
    return res.status(400).sendEnvelope("child ID required", "error");
  }

  const User = require(path.join(__dirname, "..", "..", "..", "Models", "User"));

  User.findOne({ email })
    .then((user: any) => {
      if (!user) {
        return res
          .status(403)
          .sendEnvelope("not authorized to access this child's data", "error");
      }

      return ParentLinkModel.findOne({
        parentUserId: user._id,
        studentUserId: childId,
        status: "active",
      }).then((link: any) => {
        if (!link) {
          return res
            .status(403)
            .sendEnvelope("not authorized to access this child's data", "error");
        }
        req.parentLink = link;
        next();
      });
    })
    .catch((err: Error) => {
      return res.status(500).sendEnvelope("failed to verify parent link", "error");
    });
}
