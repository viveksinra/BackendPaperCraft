import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "student@test.com" };
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
    email: "student@test.com",
    firstName: "Test",
    lastName: "Student",
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

// Mock studentService
const mockRegisterStudent = vi.fn();
const mockJoinOrganization = vi.fn();

vi.mock("../../src/services/studentService", () => ({
  registerStudent: (...args: unknown[]) => mockRegisterStudent(...args),
  joinOrganization: (...args: unknown[]) => mockJoinOrganization(...args),
  getStudentProfile: vi.fn(),
  updateStudentProfile: vi.fn(),
  getStudentDashboard: vi.fn(),
  getStudentTests: vi.fn(),
  getStudentResults: vi.fn(),
  getStudentResultDetail: vi.fn(),
  getStudentPerformance: vi.fn(),
}));

// Mock parentService (needed because server.ts imports parent routes)
vi.mock("../../src/services/parentService", () => ({
  registerParent: vi.fn(),
  linkChild: vi.fn(),
  unlinkChild: vi.fn(),
  getLinkedChildren: vi.fn(),
  getParentDashboard: vi.fn(),
  getChildTests: vi.fn(),
  getChildResults: vi.fn(),
  getChildResultDetail: vi.fn(),
  getChildPerformance: vi.fn(),
}));

// Mock role guards
vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (_req: any, _res: any, next: any) => next(),
  isParent: (_req: any, _res: any, next: any) => next(),
  isParentOf: (_req: any, _res: any, next: any) => next(),
}));

// Mock validation schemas (passthrough)
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

vi.mock("../../src/shared/validation/parentValidation", () => ({
  parentSignupSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  linkChildSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

// Mock Membership model (loaded via require in role guards / routes)
vi.mock("../../Models/Membership", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ role: "student" }),
    create: vi.fn().mockResolvedValue({}),
  },
  findOne: vi.fn().mockResolvedValue({ role: "student" }),
  create: vi.fn().mockResolvedValue({}),
}));

// Mock Company model (loaded via require in studentService)
vi.mock("../../Models/Company", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Test Org", slug: "test-org" }),
  },
  findOne: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), name: "Test Org", slug: "test-org" }),
}));

import { buildApp } from "../../src/api/server";

const BASE = "/api/v2/auth/student";

let app: ReturnType<typeof buildApp>;

describe("Student Auth API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /auth/student/signup ──────────────────────────────────────────

  describe("POST /auth/student/signup", () => {
    it("registers student, returns 201 with token", async () => {
      const userId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      mockRegisterStudent.mockResolvedValue({
        user: {
          _id: userId,
          email: "newstudent@test.com",
          firstName: "New Student",
        },
        student: {
          _id: studentId,
          userId,
          studentCode: "STU-ABC123",
          organizations: [
            {
              companyId: new mongoose.Types.ObjectId(),
              tenantId: "test-org",
              joinedAt: new Date(),
              role: "student",
              orgName: "Test Org",
              isActive: true,
            },
          ],
        },
        token: "jwt-token-123",
      });

      const res = await request(app)
        .post(`${BASE}/signup`)
        .send({
          email: "newstudent@test.com",
          password: "securePassword123",
          name: "New Student",
          orgCode: "TESTORG",
        })
        .expect(201);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.accessToken).toBe("jwt-token-123");
      expect(res.body.myData.user.email).toBe("newstudent@test.com");
      expect(res.body.myData.student.studentCode).toBe("STU-ABC123");
      expect(mockRegisterStudent).toHaveBeenCalledWith(
        "newstudent@test.com",
        "securePassword123",
        "New Student",
        "TESTORG"
      );
    });

    it("rejects invalid org code (404)", async () => {
      mockRegisterStudent.mockRejectedValue(
        Object.assign(new Error("Invalid organization code"), { status: 404 })
      );

      const res = await request(app)
        .post(`${BASE}/signup`)
        .send({
          email: "newstudent@test.com",
          password: "securePassword123",
          name: "New Student",
          orgCode: "INVALIDCODE",
        })
        .expect(404);

      expect(res.body.message).toContain("Invalid organization code");
    });

    it("rejects duplicate email (409)", async () => {
      mockRegisterStudent.mockRejectedValue(
        Object.assign(new Error("Email already registered"), { status: 409 })
      );

      const res = await request(app)
        .post(`${BASE}/signup`)
        .send({
          email: "existing@test.com",
          password: "securePassword123",
          name: "Existing Student",
          orgCode: "TESTORG",
        })
        .expect(409);

      expect(res.body.message).toContain("Email already registered");
    });
  });

  // ─── POST /auth/student/join-org ────────────────────────────────────────

  describe("POST /auth/student/join-org", () => {
    it("joins additional org (200, requires auth)", async () => {
      const studentId = new mongoose.Types.ObjectId();
      const companyId = new mongoose.Types.ObjectId();
      mockJoinOrganization.mockResolvedValue({
        _id: studentId,
        userId: new mongoose.Types.ObjectId(),
        studentCode: "STU-XYZ789",
        organizations: [
          {
            companyId,
            tenantId: "new-org",
            joinedAt: new Date(),
            role: "student",
            orgName: "New Org",
            isActive: true,
          },
        ],
      });

      const res = await request(app)
        .post(`${BASE}/join-org`)
        .send({ orgCode: "NEWORG" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.student).toBeDefined();
    });
  });
});
