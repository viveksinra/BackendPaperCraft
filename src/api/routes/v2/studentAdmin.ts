import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { sendParentInviteEmail } from "../../../services/emailService";
import { StudentModel } from "../../../models/student";
import { logger } from "../../../shared/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Membership"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Company = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Company"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const studentAdminV2Router = Router({ mergeParams: true });
studentAdminV2Router.use(ensureAuth, requireCompanyContext);

function isManager(role?: string) {
  return role === "owner" || role === "admin";
}

// POST /api/v2/companies/:companyId/students/:studentId/invite-parent
studentAdminV2Router.post(
  "/:studentId/invite-parent",
  async (req: AuthedRequest, res: Response) => {
    try {
      const { companyId, studentId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.fail("invalid companyId");
      }
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.fail("invalid studentId");
      }

      // Check requester is a manager
      const requesterEmail = (req.auth?.sub || "").toLowerCase();
      const requester = await Membership.findOne({
        companyId,
        userEmail: requesterEmail,
      });
      if (!isManager(requester?.role)) {
        return res
          .status(403)
          .sendEnvelope("requires owner or admin role", "error");
      }

      // Validate email
      const parentEmail = (req.body?.email || "").toString().trim().toLowerCase();
      if (!parentEmail) {
        return res.fail("email is required");
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail)) {
        return res.fail("invalid email format");
      }

      // Look up the student
      const student = await StudentModel.findOne({
        userId: new mongoose.Types.ObjectId(studentId),
        "organizations.companyId": new mongoose.Types.ObjectId(companyId),
      });
      if (!student) {
        return res
          .status(404)
          .sendEnvelope("student not found in this organization", "error");
      }

      // Get student user for name
      const studentUser = await User.findById(studentId);
      if (!studentUser) {
        return res.status(404).sendEnvelope("student user not found", "error");
      }

      const childName = [studentUser.firstName, studentUser.lastName]
        .filter(Boolean)
        .join(" ") || "your child";

      // Get company for name
      const company = await Company.findById(companyId);
      const companyName = company?.name || "the organization";

      // Send email (non-blocking)
      sendParentInviteEmail({
        parentEmail,
        childName,
        studentCode: student.studentCode,
        companyName,
        inviterEmail: requesterEmail,
      }).catch((emailError) => {
        logger.warn({
          msg: "Failed to send parent invite email",
          studentId,
          error:
            emailError instanceof Error
              ? emailError.message
              : String(emailError),
        });
      });

      return res.ok("parent invite email sent", {
        email: parentEmail,
        studentCode: student.studentCode,
      });
    } catch (error) {
      logger.error({ msg: "invite parent error", error });
      return res
        .status(500)
        .sendEnvelope("failed to send parent invite", "error");
    }
  }
);
