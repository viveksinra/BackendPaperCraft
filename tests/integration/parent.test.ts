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
const PARENT_USER_ID = new mongoose.Types.ObjectId();
vi.mock("../../Models/User", () => {
  const mockUser = {
    _id: PARENT_USER_ID,
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
const mockLinkChild = vi.fn();
const mockUnlinkChild = vi.fn();
const mockGetLinkedChildren = vi.fn();
const mockGetParentDashboard = vi.fn();
const mockGetChildTests = vi.fn();
const mockGetChildResults = vi.fn();
const mockGetChildResultDetail = vi.fn();
const mockGetChildPerformance = vi.fn();

vi.mock("../../src/services/parentService", () => ({
  registerParent: vi.fn(),
  linkChild: (...args: unknown[]) => mockLinkChild(...args),
  unlinkChild: (...args: unknown[]) => mockUnlinkChild(...args),
  getLinkedChildren: (...args: unknown[]) => mockGetLinkedChildren(...args),
  getParentDashboard: (...args: unknown[]) => mockGetParentDashboard(...args),
  getChildTests: (...args: unknown[]) => mockGetChildTests(...args),
  getChildResults: (...args: unknown[]) => mockGetChildResults(...args),
  getChildResultDetail: (...args: unknown[]) => mockGetChildResultDetail(...args),
  getChildPerformance: (...args: unknown[]) => mockGetChildPerformance(...args),
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

// Mock role guards -- default: allow parent through, allow isParentOf
const mockIsParent = vi.fn((_req: any, _res: any, next: any) => next());
const mockIsParentOf = vi.fn((_req: any, _res: any, next: any) => next());

vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (_req: any, _res: any, next: any) => next(),
  isParent: (...args: unknown[]) => mockIsParent(...args),
  isParentOf: (...args: unknown[]) => mockIsParentOf(...args),
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

const BASE = "/api/v2/parent";
const CHILD_ID = new mongoose.Types.ObjectId().toString();
const CHILD_STUDENT_ID = new mongoose.Types.ObjectId().toString();
const TEST_ID = new mongoose.Types.ObjectId().toString();

let app: ReturnType<typeof buildApp>;

describe("Parent API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default behavior: isParent and isParentOf pass
    mockIsParent.mockImplementation((_req: any, _res: any, next: any) => next());
    mockIsParentOf.mockImplementation((_req: any, _res: any, next: any) => next());
  });

  // ─── POST /parent/link-child ────────────────────────────────────────────

  describe("POST /parent/link-child", () => {
    it("links via student code (200)", async () => {
      const linkId = new mongoose.Types.ObjectId();
      const studentUserId = new mongoose.Types.ObjectId();
      mockLinkChild.mockResolvedValue({
        link: {
          _id: linkId,
          parentUserId: PARENT_USER_ID,
          studentUserId,
          status: "active",
          relationship: "mother",
          linkedAt: new Date(),
        },
        studentName: "Child Student",
        studentOrgs: [
          {
            companyId: new mongoose.Types.ObjectId(),
            tenantId: "test-org",
            orgName: "Test Org",
            isActive: true,
          },
        ],
      });

      const res = await request(app)
        .post(`${BASE}/link-child`)
        .send({ studentCode: "STU-ABC123", relationship: "mother" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.link.status).toBe("active");
      expect(res.body.myData.studentName).toBe("Child Student");
      expect(mockLinkChild).toHaveBeenCalled();
    });

    it("rejects invalid code (404)", async () => {
      mockLinkChild.mockRejectedValue(
        Object.assign(new Error("no student found with this code"), { status: 404 })
      );

      const res = await request(app)
        .post(`${BASE}/link-child`)
        .send({ studentCode: "STU-INVALID", relationship: "guardian" })
        .expect(404);

      expect(res.body.message).toContain("no student found with this code");
    });

    it("rejects duplicate link (409)", async () => {
      mockLinkChild.mockRejectedValue(
        Object.assign(new Error("already linked to this child"), { status: 409 })
      );

      const res = await request(app)
        .post(`${BASE}/link-child`)
        .send({ studentCode: "STU-ABC123", relationship: "father" })
        .expect(409);

      expect(res.body.message).toContain("already linked to this child");
    });
  });

  // ─── POST /parent/unlink-child/:id ──────────────────────────────────────

  describe("POST /parent/unlink-child/:studentUserId", () => {
    it("revokes link (200)", async () => {
      const linkId = new mongoose.Types.ObjectId();
      mockUnlinkChild.mockResolvedValue({
        _id: linkId,
        parentUserId: PARENT_USER_ID,
        studentUserId: new mongoose.Types.ObjectId(CHILD_ID),
        status: "revoked",
        relationship: "mother",
        revokedAt: new Date(),
      });

      const res = await request(app)
        .post(`${BASE}/unlink-child/${CHILD_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.link.status).toBe("revoked");
      expect(mockUnlinkChild).toHaveBeenCalled();
    });
  });

  // ─── GET /parent/children ───────────────────────────────────────────────

  describe("GET /parent/children", () => {
    it("returns linked children (200)", async () => {
      mockGetLinkedChildren.mockResolvedValue([
        {
          student: {
            userId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            name: "Child One",
            studentCode: "STU-AAA111",
            yearGroup: "Year 10",
            school: "Test School",
            organizations: [
              { companyId: new mongoose.Types.ObjectId(), orgName: "Org A", isActive: true },
            ],
            stats: { totalTestsTaken: 10, averageScore: 80, currentStreak: 2 },
          },
          relationship: "mother",
          linkedAt: new Date(),
        },
        {
          student: {
            userId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            name: "Child Two",
            studentCode: "STU-BBB222",
            yearGroup: "Year 8",
            school: "Another School",
            organizations: [],
            stats: { totalTestsTaken: 5, averageScore: 72, currentStreak: 0 },
          },
          relationship: "father",
          linkedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`${BASE}/children`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.children).toHaveLength(2);
      expect(res.body.myData.children[0].student.name).toBe("Child One");
      expect(res.body.myData.children[1].student.studentCode).toBe("STU-BBB222");
      expect(mockGetLinkedChildren).toHaveBeenCalled();
    });
  });

  // ─── GET /parent/dashboard ──────────────────────────────────────────────

  describe("GET /parent/dashboard", () => {
    it("returns per-child data (200)", async () => {
      mockGetParentDashboard.mockResolvedValue({
        children: [
          {
            student: {
              userId: new mongoose.Types.ObjectId(),
              studentId: new mongoose.Types.ObjectId(),
              name: "Child One",
              studentCode: "STU-AAA111",
            },
            recentResults: [
              {
                testId: TEST_ID,
                testTitle: "Math Test",
                attemptNumber: 1,
                score: 88,
                marksObtained: 88,
                totalMarks: 100,
                submittedAt: new Date().toISOString(),
              },
            ],
            upcomingTests: [
              {
                _id: new mongoose.Types.ObjectId(),
                title: "Science Quiz",
                mode: "live_mock",
                status: "scheduled",
              },
            ],
            stats: { streak: 3, totalTests: 10, average: 80 },
            alerts: [{ type: "new_results", message: "New results available" }],
          },
        ],
      });

      const res = await request(app)
        .get(`${BASE}/dashboard`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.children).toHaveLength(1);
      expect(res.body.myData.children[0].recentResults).toHaveLength(1);
      expect(res.body.myData.children[0].upcomingTests).toHaveLength(1);
      expect(res.body.myData.children[0].stats.streak).toBe(3);
      expect(res.body.myData.children[0].alerts).toHaveLength(1);
      expect(mockGetParentDashboard).toHaveBeenCalled();
    });
  });

  // ─── GET /parent/children/:childId/tests ────────────────────────────────

  describe("GET /parent/children/:childId/tests", () => {
    it("returns child's tests (200)", async () => {
      mockGetChildTests.mockResolvedValue({
        tests: [
          {
            _id: new mongoose.Types.ObjectId(),
            title: "Math Mock",
            mode: "live_mock",
            status: "scheduled",
            totalMarks: 100,
            totalQuestions: 30,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            title: "Practice Quiz",
            mode: "practice",
            status: "live",
            totalMarks: 50,
            totalQuestions: 20,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      });

      const res = await request(app)
        .get(`${BASE}/children/${CHILD_ID}/tests?page=1&pageSize=20`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.tests).toHaveLength(2);
      expect(res.body.myData.total).toBe(2);
      expect(res.body.myData.page).toBe(1);
      expect(mockGetChildTests).toHaveBeenCalled();
    });
  });

  // ─── GET /parent/children/:childId/results ──────────────────────────────

  describe("GET /parent/children/:childId/results", () => {
    it("returns child's results (200)", async () => {
      mockGetChildResults.mockResolvedValue({
        results: [
          {
            attemptId: new mongoose.Types.ObjectId(),
            testId: TEST_ID,
            testTitle: "Math Test",
            attemptNumber: 1,
            status: "graded",
            submittedAt: new Date().toISOString(),
            result: {
              totalMarks: 100,
              marksObtained: 85,
              percentage: 85,
              grade: "A",
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await request(app)
        .get(`${BASE}/children/${CHILD_ID}/results?page=1&pageSize=20`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.results).toHaveLength(1);
      expect(res.body.myData.results[0].testTitle).toBe("Math Test");
      expect(res.body.myData.results[0].result.percentage).toBe(85);
      expect(res.body.myData.total).toBe(1);
      expect(mockGetChildResults).toHaveBeenCalled();
    });

    it("returns 403 for unlinked child", async () => {
      // Override isParentOf to block access
      mockIsParentOf.mockImplementation((_req: any, res: any, _next: any) => {
        return res.status(403).sendEnvelope("not authorized to access this child's data", "error");
      });

      const unlinkedChildId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .get(`${BASE}/children/${unlinkedChildId}/results`)
        .expect(403);

      expect(res.body.message).toContain("not authorized to access this child's data");
      expect(mockGetChildResults).not.toHaveBeenCalled();
    });
  });

  // ─── GET /parent/children/:childId/performance ──────────────────────────

  describe("GET /parent/children/:childId/performance", () => {
    it("returns trends (200)", async () => {
      mockGetChildPerformance.mockResolvedValue({
        scoreTrend: [
          { date: "2025-01-01", score: 72 },
          { date: "2025-01-15", score: 78 },
          { date: "2025-02-01", score: 85 },
        ],
        subjectBreakdown: [
          { subjectId: "math-001", subjectName: "Mathematics", averageScore: 82, totalAttempts: 5 },
          { subjectId: "phys-001", subjectName: "Physics", averageScore: 75, totalAttempts: 3 },
        ],
        difficultyAnalysis: {
          easy: { correct: 46, total: 50 },
          medium: { correct: 30, total: 40 },
          hard: { correct: 11, total: 20 },
        },
        timeAnalysis: {
          averageTimePerQuestion: 45,
          averageTotalTime: 2700,
        },
      });

      const res = await request(app)
        .get(`${BASE}/children/${CHILD_ID}/performance`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.scoreTrend).toHaveLength(3);
      expect(res.body.myData.subjectBreakdown).toHaveLength(2);
      expect(res.body.myData.difficultyAnalysis.easy.correct).toBe(46);
      expect(res.body.myData.timeAnalysis.averageTimePerQuestion).toBe(45);
      expect(mockGetChildPerformance).toHaveBeenCalled();
    });
  });
});
