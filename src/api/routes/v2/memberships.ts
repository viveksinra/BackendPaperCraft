import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import path from "path";
import { nanoid } from "nanoid";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { sendInviteEmail } from "../../../services/emailService";
import { logger } from "../../../shared/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Membership"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Invite = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Invite"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Company = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Company"));

type AuthedRequest = Request & { auth?: { sub?: string } };

export const membershipsV2Router = Router({ mergeParams: true });
membershipsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/memberships - List all members
membershipsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }
    const members = await Membership.find({ companyId }).sort({ createdAt: -1 });

    // Fetch user details for all members
    const emails = members.map((m: Record<string, any>) => m.userEmail);
    const users = await User.find({ email: { $in: emails } }).select("email firstName lastName photoURL");
    const userMap = new Map<string, Record<string, any>>(users.map((u: Record<string, any>) => [u.email, u]));

    return res.ok("memberships", {
      members: members.map((member: Record<string, any>) => {
        const user = userMap.get(member.userEmail);
        return {
          id: member._id.toString(),
          email: member.userEmail,
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          displayName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
          photoURL: user?.photoURL || "",
          role: member.role,
          status: member.status || "active",
          createdAt: member.createdAt,
        };
      }),
    });
  } catch (error) {
    logger.error({ msg: "list memberships error", error });
    return res.status(500).sendEnvelope("failed to list memberships", "error");
  }
});

// GET /api/v2/companies/:companyId/memberships/invites - List all invites
membershipsV2Router.get("/invites", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }

    const requesterEmail = (req.auth?.sub || "").toLowerCase();
    const requester = await Membership.findOne({ companyId, userEmail: requesterEmail });
    if (!isManager(requester?.role)) {
      return res.status(403).sendEnvelope("requires owner or admin role", "error");
    }

    const invites = await Invite.find({ companyId }).sort({ createdAt: -1 });

    return res.ok("invites", {
      invites: invites.map((invite: Record<string, any>) => ({
        id: invite._id.toString(),
        code: invite.code,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdBy: invite.createdBy,
        createdAt: invite.createdAt,
        usedAt: invite.usedAt,
        usedBy: invite.usedBy,
      })),
    });
  } catch (error) {
    logger.error({ msg: "list invites error", error });
    return res.status(500).sendEnvelope("failed to list invites", "error");
  }
});

// POST /api/v2/companies/:companyId/memberships/invite - Create an invite
membershipsV2Router.post("/invite", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }

    const requesterEmail = (req.auth?.sub || "").toLowerCase();
    const requester = await Membership.findOne({ companyId, userEmail: requesterEmail });
    if (!isManager(requester?.role)) {
      return res.status(403).sendEnvelope("requires owner or admin role", "error");
    }

    const inviteeEmail = (req.body?.email || "").toString().trim().toLowerCase();
    if (!inviteeEmail) {
      return res.fail("email required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteeEmail)) {
      return res.fail("invalid email format");
    }

    const role = req.body?.role || "teacher";
    const validRoles = ["admin", "senior_teacher", "teacher", "content_reviewer", "student", "parent"];
    if (!validRoles.includes(role)) {
      return res.fail("invalid role");
    }

    // Check if user is already a member
    const existingMember = await Membership.findOne({ companyId, userEmail: inviteeEmail });
    if (existingMember) {
      return res.fail("user is already a member of this company");
    }

    // Check if there's already a pending invite for this email
    const existingInvite = await Invite.findOne({
      companyId,
      email: inviteeEmail,
      status: "pending",
    });
    if (existingInvite) {
      return res.fail("an invite is already pending for this email");
    }

    // Get company name for email
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).sendEnvelope("company not found", "error");
    }

    // Generate unique invite code
    const code = nanoid(12);

    // Create the invite
    const invite = new Invite({
      code,
      companyId,
      email: inviteeEmail,
      role,
      createdBy: requesterEmail,
      status: "pending",
    });
    await invite.save();

    // Send invitation email (non-blocking)
    sendInviteEmail({
      inviteeEmail,
      inviterEmail: requesterEmail,
      companyName: company.name,
      role,
      inviteCode: code,
    }).catch((emailError) => {
      logger.warn({
        msg: "Failed to send invite email",
        inviteCode: code,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    });

    return res.ok("invite created", {
      invite: {
        id: invite._id.toString(),
        code: invite.code,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    logger.error({ msg: "create invite error", error });
    return res.status(500).sendEnvelope("failed to create invite", "error");
  }
});

// DELETE /api/v2/companies/:companyId/memberships/invite/:code - Revoke an invite
membershipsV2Router.delete("/invite/:code", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    const code = req.params.code;

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.fail("invalid companyId");
    }

    const requesterEmail = (req.auth?.sub || "").toLowerCase();
    const requester = await Membership.findOne({ companyId, userEmail: requesterEmail });
    if (!isManager(requester?.role)) {
      return res.status(403).sendEnvelope("requires owner or admin role", "error");
    }

    const invite = await Invite.findOne({ code, companyId });
    if (!invite) {
      return res.status(404).sendEnvelope("invite not found", "error");
    }

    if (invite.status !== "pending") {
      return res.fail("invite is no longer pending");
    }

    invite.status = "revoked";
    await invite.save();

    return res.ok("invite revoked");
  } catch (error) {
    logger.error({ msg: "revoke invite error", error });
    return res.status(500).sendEnvelope("failed to revoke invite", "error");
  }
});

// PATCH /api/v2/companies/:companyId/memberships/:membershipId - Update member role
membershipsV2Router.patch("/:membershipId", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    const membershipId = req.params.membershipId;

    // Check if membershipId is actually an email (for backwards compatibility)
    const isEmail = membershipId.includes("@");

    if (!isEmail && !mongoose.Types.ObjectId.isValid(membershipId)) {
      return res.fail("invalid membershipId");
    }

    const requesterEmail = (req.auth?.sub || "").toLowerCase();
    const requester = await Membership.findOne({ companyId, userEmail: requesterEmail });
    if (!isManager(requester?.role)) {
      return res.status(403).sendEnvelope("requires owner or admin role", "error");
    }

    const query = isEmail
      ? { companyId, userEmail: decodeURIComponent(membershipId).toLowerCase() }
      : { _id: membershipId, companyId };

    const updated = await Membership.findOneAndUpdate(query, { $set: { role: req.body?.role || "teacher" } }, { new: true });
    if (!updated) {
      return res.status(404).sendEnvelope("membership not found", "error");
    }

    return res.ok("membership updated", {
      membership: {
        id: updated._id.toString(),
        email: updated.userEmail,
        role: updated.role,
      },
    });
  } catch (error) {
    logger.error({ msg: "update membership error", error });
    return res.status(500).sendEnvelope("failed to update membership", "error");
  }
});

// DELETE /api/v2/companies/:companyId/memberships/:membershipId - Remove a member
membershipsV2Router.delete("/:membershipId", async (req: AuthedRequest, res: Response) => {
  try {
    const companyId = req.params.companyId;
    const membershipId = req.params.membershipId;

    // Check if membershipId is actually an email (for backwards compatibility)
    const isEmail = membershipId.includes("@");

    if (!isEmail && !mongoose.Types.ObjectId.isValid(membershipId)) {
      return res.fail("invalid membershipId");
    }

    const requesterEmail = (req.auth?.sub || "").toLowerCase();
    const requester = await Membership.findOne({ companyId, userEmail: requesterEmail });
    if (!isManager(requester?.role)) {
      return res.status(403).sendEnvelope("requires owner or admin role", "error");
    }

    const query = isEmail
      ? { companyId, userEmail: decodeURIComponent(membershipId).toLowerCase() }
      : { _id: membershipId, companyId };

    await Membership.deleteOne(query);
    return res.ok("membership removed");
  } catch (error) {
    logger.error({ msg: "remove membership error", error });
    return res.status(500).sendEnvelope("failed to remove membership", "error");
  }
});

function isManager(role?: string) {
  return role === "owner" || role === "admin";
}

// =============================================================================
// PUBLIC INVITE ROUTES (no company context required)
// =============================================================================

export const invitePublicRouter = Router();
invitePublicRouter.use(ensureAuth);

// GET /api/v2/invites/:code - Get invite details (for accept page)
invitePublicRouter.get("/:code", async (req: AuthedRequest, res: Response) => {
  try {
    const code = req.params.code;
    const invite = await Invite.findOne({ code });

    if (!invite) {
      return res.status(404).sendEnvelope("invite not found", "error");
    }

    // Check if expired (7 days)
    const createdAt = new Date(invite.createdAt);
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const isExpired = new Date() > expiresAt;

    if (isExpired && invite.status === "pending") {
      invite.status = "revoked";
      await invite.save();
    }

    // Get company details
    const company = await Company.findById(invite.companyId);

    return res.ok("invite details", {
      invite: {
        code: invite.code,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: expiresAt.toISOString(),
        isExpired: invite.status !== "pending",
      },
      company: company
        ? {
            id: company._id.toString(),
            name: company.name,
            slug: company.slug,
          }
        : null,
    });
  } catch (error) {
    logger.error({ msg: "get invite error", error });
    return res.status(500).sendEnvelope("failed to get invite details", "error");
  }
});

// POST /api/v2/invites/:code/accept - Accept an invite
invitePublicRouter.post("/:code/accept", async (req: AuthedRequest, res: Response) => {
  try {
    const code = req.params.code;
    const userEmail = (req.auth?.sub || "").toLowerCase();

    if (!userEmail) {
      return res.status(401).sendEnvelope("authentication required", "error");
    }

    const invite = await Invite.findOne({ code });
    if (!invite) {
      return res.status(404).sendEnvelope("invite not found", "error");
    }

    if (invite.status !== "pending") {
      return res.fail("invite is no longer valid");
    }

    // Check if expired
    const createdAt = new Date(invite.createdAt);
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      invite.status = "revoked";
      await invite.save();
      return res.fail("invite has expired");
    }

    // Check if user is already a member
    const existingMembership = await Membership.findOne({
      companyId: invite.companyId,
      userEmail,
    });
    if (existingMembership) {
      return res.fail("you are already a member of this company");
    }

    // Create membership
    const membership = new Membership({
      companyId: invite.companyId,
      userEmail,
      role: invite.role,
    });
    await membership.save();

    // Update invite status
    invite.status = "used";
    invite.usedAt = new Date();
    invite.usedBy = userEmail;
    await invite.save();

    // Get company details for response
    const company = await Company.findById(invite.companyId);

    return res.ok("invite accepted", {
      membership: {
        id: membership._id.toString(),
        companyId: invite.companyId.toString(),
        email: userEmail,
        role: invite.role,
      },
      company: company
        ? {
            id: company._id.toString(),
            name: company.name,
            slug: company.slug,
          }
        : null,
    });
  } catch (error) {
    logger.error({ msg: "accept invite error", error });
    return res.status(500).sendEnvelope("failed to accept invite", "error");
  }
});
