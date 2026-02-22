import { Router, Request, Response } from "express";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { signToken, verifyPassword, createPasswordRecord, loginRateLimit, ensureAuth } = legacyAuth;
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const User = require(path.join(__dirname, "..", "..", "..", "..", "Models", "User"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Membership = require(path.join(__dirname, "..", "..", "..", "..", "Models", "Membership"));

type AuthedRequest = Request & {
  tenantId?: string;
  auth?: { sub?: string; tenantId?: string; roles?: string[] };
};

export const authV2Router = Router();

authV2Router.post("/login", loginRateLimit(), async (req: AuthedRequest, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { email, password, userName } = req.body || {};
    const identifier = (email || userName || "").toString().trim().toLowerCase();
    const pass = (password || "").toString();
    if (!identifier || !pass) {
      return res.fail("email/username and password required");
    }

    const userDoc = await User.findOne({ email: identifier });
    if (!userDoc || !verifyPassword(pass, userDoc.password)) {
      return res.status(401).sendEnvelope("invalid credentials", "error");
    }

    // Look up membership role from the user's active company (or first membership)
    let membershipRole: string | null = null;
    const membershipQuery = userDoc.lastActiveCompanyId
      ? { userEmail: identifier, companyId: userDoc.lastActiveCompanyId }
      : { userEmail: identifier };
    const membership = await Membership.findOne(membershipQuery);
    if (membership) {
      membershipRole = membership.role;
    }

    const roles = ["user"];
    const token = signToken({ sub: identifier, tenantId: req.tenantId, roles, isSuperAdmin: !!userDoc.isSuperAdmin, role: membershipRole });
    setAuthCookie(res, token);

    const user = sanitizeUser(userDoc, roles, membershipRole);
    const myData = { user, tenantId: req.tenantId, accessToken: token };
    return res.json({
      message: "login success",
      variant: "success",
      myData,
      user,
      tenantId: req.tenantId,
      accessToken: token,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("login error", error);
    return res.status(500).sendEnvelope("internal server error", "error");
  }
});

authV2Router.post("/logout", (_req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  const cookie = ["seo_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", isProd ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
  return res.ok("logout success");
});

authV2Router.get("/me", ensureAuth, async (req: AuthedRequest, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const email = (req.auth?.sub || "").toLowerCase();
    const userDoc = await User.findOne({ email });
    if (!userDoc) {
      return res.status(404).sendEnvelope("user not found", "error");
    }
    // Look up membership role
    let membershipRole: string | null = null;
    const membershipQuery = userDoc.lastActiveCompanyId
      ? { userEmail: email, companyId: userDoc.lastActiveCompanyId }
      : { userEmail: email };
    const meMembership = await Membership.findOne(membershipQuery);
    if (meMembership) {
      membershipRole = meMembership.role;
    }
    const user = sanitizeUser(userDoc, req.auth?.roles || ["user"], membershipRole);
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const myData = accessToken ? { user, tenantId: req.auth?.tenantId, accessToken } : { user, tenantId: req.auth?.tenantId };
    return res.json({
      message: "user info",
      variant: "success",
      myData,
      user,
      tenantId: req.auth?.tenantId,
      ...(accessToken ? { accessToken } : {}),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("me error", error);
    return res.status(500).sendEnvelope("internal server error", "error");
  }
});

authV2Router.put("/profile", ensureAuth, async (req: AuthedRequest, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const email = (req.auth?.sub || "").toLowerCase();
    const updateFields: Record<string, string> = {};
    const { firstName, lastName, photoURL, phoneNumber, about } = req.body || {};
    if (firstName !== undefined) updateFields.firstName = sanitizeText(firstName, 50);
    if (lastName !== undefined) updateFields.lastName = sanitizeText(lastName, 50);
    if (photoURL !== undefined) updateFields.photoURL = sanitizeText(photoURL, 500);
    if (phoneNumber !== undefined) updateFields.phoneNumber = sanitizeText(phoneNumber, 20);
    if (about !== undefined) updateFields.about = sanitizeText(about, 500);

    if (!Object.keys(updateFields).length) {
      return res.fail("no fields to update");
    }

    const updatedUser = await User.findOneAndUpdate({ email }, { $set: updateFields }, { new: true });
    if (!updatedUser) {
      return res.status(404).sendEnvelope("user not found", "error");
    }
    const profileMembership = await Membership.findOne(
      updatedUser.lastActiveCompanyId
        ? { userEmail: email, companyId: updatedUser.lastActiveCompanyId }
        : { userEmail: email }
    );
    const user = sanitizeUser(updatedUser, req.auth?.roles || ["user"], profileMembership?.role);
    return res.json({ message: "profile updated", variant: "success", myData: { user }, user });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("profile error", error);
    return res.status(500).sendEnvelope("internal server error", "error");
  }
});

authV2Router.post("/signup", async (req: AuthedRequest, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const identifier = (req.body?.email || "").toString().trim().toLowerCase();
    const pass = (req.body?.password || "").toString();
    if (!identifier || !pass) {
      return res.fail("email and password required");
    }
    const existingUser = await User.findOne({ email: identifier });
    if (existingUser) {
      return res.status(409).sendEnvelope("user already exists", "error");
    }
    const record = createPasswordRecord(pass);
    const newUser = new User({
      email: identifier,
      password: record,
      firstName: sanitizeText(req.body?.firstName, 50),
      lastName: sanitizeText(req.body?.lastName, 50),
    });
    await newUser.save();
    const roles = ["user"];
    const token = signToken({ sub: identifier, tenantId: req.tenantId, roles });
    setAuthCookie(res, token);
    const user = sanitizeUser(newUser, roles);
    const myData = { user, tenantId: req.tenantId, accessToken: token };
    return res.json({
      message: "signup success",
      variant: "success",
      myData,
      user,
      tenantId: req.tenantId,
      accessToken: token,
    });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("signup error", error);
    if (error?.code === 11000) {
      return res.status(409).sendEnvelope("user already exists", "error");
    }
    return res.status(500).sendEnvelope("internal server error", "error");
  }
});

function sanitizeText(value: unknown, max = 100) {
  return (value || "").toString().trim().slice(0, max);
}

function sanitizeUser(userDoc: Record<string, any>, roles: string[], membershipRole?: string | null) {
  return {
    email: userDoc.email,
    firstName: userDoc.firstName || "",
    lastName: userDoc.lastName || "",
    displayName:
      userDoc.firstName && userDoc.lastName
        ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
        : (userDoc.email || "").split("@")[0],
    photoURL: userDoc.photoURL || "",
    phoneNumber: userDoc.phoneNumber || "",
    about: userDoc.about || "",
    roles,
    role: membershipRole || userDoc.registeredAs || null,
    isSuperAdmin: !!userDoc.isSuperAdmin,
    createdAt: userDoc.createdAt,
  };
}

function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `seo_auth=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

