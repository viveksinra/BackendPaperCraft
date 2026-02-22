import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "parent@test.com" };
    req.tenantId = "testTenant";
    next();
  },
  createPasswordRecord: vi.fn().mockReturnValue({ hash: "hashed", salt: "salt" }),
  signToken: vi.fn().mockReturnValue("mock-jwt-token"),
}));

// Mock User model (loaded via require in route)
vi.mock("../../Models/User", () => {
  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "parent@test.com",
    firstName: "Test",
    lastName: "Parent",
  };
  return {
    __esModule: true,
    default: {
      findOne: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn().mockResolvedValue(mockUser),
    },
    findOne: vi.fn().mockResolvedValue(mockUser),
    findById: vi.fn().mockResolvedValue(mockUser),
    create: vi.fn().mockResolvedValue(mockUser),
  };
});

// Mock Membership model
vi.mock("../../Models/Membership", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ role: "parent" }),
    create: vi.fn().mockResolvedValue({}),
  },
  findOne: vi.fn().mockResolvedValue({ role: "parent" }),
  create: vi.fn().mockResolvedValue({}),
}));

// Mock Company model
vi.mock("../../Models/Company", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Test Org", slug: "test-org" }),
  },
  findOne: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Test Org", slug: "test-org" }),
}));

// Mock parentService
const mockRegisterParent = vi.fn();

vi.mock("../../src/services/parentService", () => ({
  registerParent: (...args: unknown[]) => mockRegisterParent(...args),
  linkChild: vi.fn(),
  unlinkChild: vi.fn(),
  getLinkedChildren: vi.fn(),
  getParentDashboard: vi.fn(),
  getChildTests: vi.fn(),
  getChildResults: vi.fn(),
  getChildResultDetail: vi.fn(),
  getChildPerformance: vi.fn(),
}));

// Mock studentService (needed because server.ts imports student routes)
vi.mock("../../src/services/studentService", () => ({
  registerStudent: vi.fn(),
  joinOrganization: vi.fn(),
  getStudentProfile: vi.fn(),
  updateStudentProfile: vi.fn(),
  getStudentDashboard: vi.fn(),
  getStudentTests: vi.fn(),
  getStudentResults: vi.fn(),
  getStudentResultDetail: vi.fn(),
  getStudentPerformance: vi.fn(),
}));

// Mock role guards
vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (_req: any, _res: any, next: any) => next(),
  isParent: (_req: any, _res: any, next: any) => next(),
  isParentOf: (_req: any, _res: any, next: any) => next(),
}));

// Mock validation schemas (passthrough)
vi.mock("../../src/shared/validation/parentValidation", () => ({
  parentSignupSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  linkChildSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

vi.mock("../../src/shared/validation/studentValidation", () => ({
  studentSignupSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  joinOrgSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  updateStudentProfileSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

import { buildApp } from "../../src/api/server";

const BASE = "/api/v2/auth/parent";

let app: ReturnType<typeof buildApp>;

describe("Parent Auth API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /auth/parent/signup ───────────────────────────────────────────

  describe("POST /auth/parent/signup", () => {
    it("registers parent, returns 201 with token", async () => {
      const userId = new mongoose.Types.ObjectId();
      mockRegisterParent.mockResolvedValue({
        user: {
          _id: userId,
          email: "newparent@test.com",
          firstName: "New Parent",
        },
        token: "jwt-parent-token-123",
      });

      const res = await request(app)
        .post(`${BASE}/signup`)
        .send({
          email: "newparent@test.com",
          password: "securePassword123",
          name: "New Parent",
        })
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.accessToken).toBe("jwt-parent-token-123");
      expect(res.body.myData.user.email).toBe("newparent@test.com");
      expect(mockRegisterParent).toHaveBeenCalledWith(
        "newparent@test.com",
        "securePassword123",
        "New Parent"
      );
    });

    it("rejects duplicate email (409)", async () => {
      mockRegisterParent.mockRejectedValue(
        Object.assign(new Error("email already registered"), { status: 409 })
      );

      const res = await request(app)
        .post(`${BASE}/signup`)
        .send({
          email: "existing@test.com",
          password: "securePassword123",
          name: "Existing Parent",
        })
        .expect(409);

      expect(res.body.message).toContain("email already registered");
    });
  });
});
