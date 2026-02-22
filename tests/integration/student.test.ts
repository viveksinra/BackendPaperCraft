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
const STUDENT_USER_ID = new mongoose.Types.ObjectId();
vi.mock("../../Models/User", () => {
  const mockUser = {
    _id: STUDENT_USER_ID,
    email: "student@test.com",
    firstName: "Test",
    lastName: "Student",
  };
  return {
    __esModule: true,
    default: {
      findOne: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
      findByIdAndUpdate: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn().mockResolvedValue(mockUser),
    },
    findOne: vi.fn().mockResolvedValue(mockUser),
    findById: vi.fn().mockResolvedValue(mockUser),
    findByIdAndUpdate: vi.fn().mockResolvedValue(mockUser),
    create: vi.fn().mockResolvedValue(mockUser),
  };
});

// Mock Membership model
vi.mock("../../Models/Membership", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ role: "student" }),
    create: vi.fn().mockResolvedValue({}),
  },
  findOne: vi.fn().mockResolvedValue({ role: "student" }),
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

// Mock studentService
const mockGetStudentProfile = vi.fn();
const mockUpdateStudentProfile = vi.fn();
const mockGetStudentDashboard = vi.fn();
const mockGetStudentTests = vi.fn();
const mockGetStudentResults = vi.fn();
const mockGetStudentResultDetail = vi.fn();
const mockGetStudentPerformance = vi.fn();

vi.mock("../../src/services/studentService", () => ({
  registerStudent: vi.fn(),
  joinOrganization: vi.fn(),
  getStudentProfile: (...args: unknown[]) => mockGetStudentProfile(...args),
  updateStudentProfile: (...args: unknown[]) => mockUpdateStudentProfile(...args),
  getStudentDashboard: (...args: unknown[]) => mockGetStudentDashboard(...args),
  getStudentTests: (...args: unknown[]) => mockGetStudentTests(...args),
  getStudentResults: (...args: unknown[]) => mockGetStudentResults(...args),
  getStudentResultDetail: (...args: unknown[]) => mockGetStudentResultDetail(...args),
  getStudentPerformance: (...args: unknown[]) => mockGetStudentPerformance(...args),
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

// Mock role guards -- default: allow student through
const mockIsStudent = vi.fn((_req: any, _res: any, next: any) => next());
const mockIsParent = vi.fn((_req: any, _res: any, next: any) => next());
const mockIsParentOf = vi.fn((_req: any, _res: any, next: any) => next());

vi.mock("../../src/shared/middleware/roleGuards", () => ({
  isStudent: (...args: unknown[]) => mockIsStudent(...args),
  isParent: (...args: unknown[]) => mockIsParentOf(...args),
  isParentOf: (...args: unknown[]) => mockIsParentOf(...args),
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

import { buildApp } from "../../src/api/server";

const BASE = "/api/v2/student";
const TEST_ID = new mongoose.Types.ObjectId().toString();

let app: ReturnType<typeof buildApp>;

describe("Student API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default behavior: isStudent passes
    mockIsStudent.mockImplementation((_req: any, _res: any, next: any) => next());
  });

  // ─── GET /student/profile ───────────────────────────────────────────────

  describe("GET /student/profile", () => {
    it("returns student profile (200)", async () => {
      const profile = {
        _id: new mongoose.Types.ObjectId(),
        userId: STUDENT_USER_ID,
        studentCode: "STU-ABC123",
        email: "student@test.com",
        name: "Test Student",
        firstName: "Test",
        lastName: "Student",
        yearGroup: "Year 10",
        school: "Test School",
        organizations: [
          {
            companyId: new mongoose.Types.ObjectId(),
            tenantId: "test-org",
            orgName: "Test Org",
            isActive: true,
          },
        ],
        preferences: {
          showTimerWarning: true,
          questionFontSize: "medium",
          highContrastMode: false,
        },
      };
      mockGetStudentProfile.mockResolvedValue(profile);

      const res = await request(app)
        .get(`${BASE}/profile`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.profile.studentCode).toBe("STU-ABC123");
      expect(res.body.myData.profile.email).toBe("student@test.com");
      expect(mockGetStudentProfile).toHaveBeenCalled();
    });
  });

  // ─── PATCH /student/profile ─────────────────────────────────────────────

  describe("PATCH /student/profile", () => {
    it("updates year group and preferences (200)", async () => {
      const updatedProfile = {
        _id: new mongoose.Types.ObjectId(),
        userId: STUDENT_USER_ID,
        studentCode: "STU-ABC123",
        yearGroup: "Year 11",
        preferences: {
          showTimerWarning: false,
          questionFontSize: "large",
          highContrastMode: true,
        },
      };
      mockUpdateStudentProfile.mockResolvedValue(updatedProfile);

      const res = await request(app)
        .patch(`${BASE}/profile`)
        .send({
          yearGroup: "Year 11",
          preferences: {
            showTimerWarning: false,
            questionFontSize: "large",
            highContrastMode: true,
          },
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.profile.yearGroup).toBe("Year 11");
      expect(res.body.myData.profile.preferences.questionFontSize).toBe("large");
      expect(mockUpdateStudentProfile).toHaveBeenCalled();
    });
  });

  // ─── GET /student/dashboard ─────────────────────────────────────────────

  describe("GET /student/dashboard", () => {
    it("returns dashboard data (200)", async () => {
      const dashboard = {
        upcomingTests: [
          {
            _id: new mongoose.Types.ObjectId(),
            title: "Math Mock Test",
            mode: "live_mock",
            status: "scheduled",
            scheduling: { startTime: new Date().toISOString() },
          },
        ],
        recentResults: [
          {
            testId: TEST_ID,
            testName: "Physics Test",
            score: 82,
            marksObtained: 82,
            totalMarks: 100,
            completedAt: new Date().toISOString(),
          },
        ],
        pendingHomework: [],
        stats: {
          totalTestsTaken: 15,
          averageScore: 78,
          currentStreak: 3,
          longestStreak: 7,
        },
      };
      mockGetStudentDashboard.mockResolvedValue(dashboard);

      const res = await request(app)
        .get(`${BASE}/dashboard`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.upcomingTests).toHaveLength(1);
      expect(res.body.myData.recentResults).toHaveLength(1);
      expect(res.body.myData.stats.totalTestsTaken).toBe(15);
      expect(mockGetStudentDashboard).toHaveBeenCalled();
    });
  });

  // ─── GET /student/tests ─────────────────────────────────────────────────

  describe("GET /student/tests", () => {
    it("lists tests with pagination (200)", async () => {
      const result = {
        tests: [
          {
            testId: TEST_ID,
            title: "English Mock",
            mode: "anytime_mock",
            status: "available",
          },
          {
            testId: new mongoose.Types.ObjectId().toString(),
            title: "Science Quiz",
            mode: "practice",
            status: "available",
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      };
      mockGetStudentTests.mockResolvedValue(result);

      const res = await request(app)
        .get(`${BASE}/tests?page=1&pageSize=20&status=available`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.tests).toHaveLength(2);
      expect(res.body.myData.total).toBe(2);
      expect(res.body.myData.page).toBe(1);
      expect(mockGetStudentTests).toHaveBeenCalled();
    });
  });

  // ─── GET /student/results ───────────────────────────────────────────────

  describe("GET /student/results", () => {
    it("lists results with filters (200)", async () => {
      const result = {
        results: [
          {
            _id: new mongoose.Types.ObjectId(),
            testId: TEST_ID,
            testTitle: "Math Test",
            status: "graded",
            result: { percentage: 85, marksObtained: 85, totalMarks: 100 },
            submittedAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      mockGetStudentResults.mockResolvedValue(result);

      const res = await request(app)
        .get(`${BASE}/results?page=1&pageSize=20&subject=math`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.results).toHaveLength(1);
      expect(res.body.myData.total).toBe(1);
      expect(mockGetStudentResults).toHaveBeenCalled();
    });
  });

  // ─── GET /student/results/:testId ───────────────────────────────────────

  describe("GET /student/results/:testId", () => {
    it("returns result detail (200)", async () => {
      const resultDetail = {
        attemptId: new mongoose.Types.ObjectId().toString(),
        testId: TEST_ID,
        testTitle: "Math Test",
        testMode: "live_mock",
        attemptNumber: 1,
        status: "graded",
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        result: {
          totalMarks: 100,
          marksObtained: 85,
          percentage: 85,
          grade: "A",
          isPassing: true,
        },
        breakdown: [
          {
            questionId: new mongoose.Types.ObjectId().toString(),
            questionType: "mcq",
            studentAnswer: "B",
            isCorrect: true,
            marksAwarded: 5,
            maxMarks: 5,
            correctAnswer: "B",
            solution: "The answer is B because...",
          },
        ],
        showSolutions: true,
      };
      mockGetStudentResultDetail.mockResolvedValue(resultDetail);

      const res = await request(app)
        .get(`${BASE}/results/${TEST_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.result.testTitle).toBe("Math Test");
      expect(res.body.myData.result.result.percentage).toBe(85);
      expect(res.body.myData.result.breakdown).toHaveLength(1);
      expect(res.body.myData.result.showSolutions).toBe(true);
      expect(res.body.myData.result.breakdown[0].correctAnswer).toBe("B");
      expect(mockGetStudentResultDetail).toHaveBeenCalled();
    });

    it("hides solutions when flag is false", async () => {
      const resultDetail = {
        attemptId: new mongoose.Types.ObjectId().toString(),
        testId: TEST_ID,
        testTitle: "Math Test",
        testMode: "live_mock",
        attemptNumber: 1,
        status: "graded",
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        result: {
          totalMarks: 100,
          marksObtained: 85,
          percentage: 85,
          grade: "A",
          isPassing: true,
        },
        breakdown: [
          {
            questionId: new mongoose.Types.ObjectId().toString(),
            questionType: "mcq",
            studentAnswer: "B",
            isCorrect: true,
            marksAwarded: 5,
            maxMarks: 5,
            // No correctAnswer or solution fields
          },
        ],
        showSolutions: false,
      };
      mockGetStudentResultDetail.mockResolvedValue(resultDetail);

      const res = await request(app)
        .get(`${BASE}/results/${TEST_ID}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.result.showSolutions).toBe(false);
      expect(res.body.myData.result.breakdown[0]).not.toHaveProperty("correctAnswer");
      expect(res.body.myData.result.breakdown[0]).not.toHaveProperty("solution");
      expect(mockGetStudentResultDetail).toHaveBeenCalled();
    });
  });

  // ─── GET /student/performance ───────────────────────────────────────────

  describe("GET /student/performance", () => {
    it("returns trend data (200)", async () => {
      const performance = {
        scoreTrend: [
          { testName: "Test 1", score: 72, date: new Date().toISOString() },
          { testName: "Test 2", score: 78, date: new Date().toISOString() },
          { testName: "Test 3", score: 85, date: new Date().toISOString() },
        ],
        subjectBreakdown: [
          { subject: "Mathematics", averageScore: 82, testCount: 5 },
          { subject: "Physics", averageScore: 75, testCount: 3 },
        ],
        difficultyAnalysis: [
          { difficulty: "easy", correctRate: 92, totalQuestions: 50, correctCount: 46 },
          { difficulty: "medium", correctRate: 75, totalQuestions: 40, correctCount: 30 },
          { difficulty: "hard", correctRate: 55, totalQuestions: 20, correctCount: 11 },
        ],
        timeAnalysis: {
          averageTimePerQuestion: 45,
        },
      };
      mockGetStudentPerformance.mockResolvedValue(performance);

      const res = await request(app)
        .get(`${BASE}/performance`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.scoreTrend).toHaveLength(3);
      expect(res.body.myData.subjectBreakdown).toHaveLength(2);
      expect(res.body.myData.difficultyAnalysis).toHaveLength(3);
      expect(res.body.myData.timeAnalysis.averageTimePerQuestion).toBe(45);
      expect(mockGetStudentPerformance).toHaveBeenCalled();
    });

    it("returns 403 for non-student user", async () => {
      // Override isStudent to block access
      mockIsStudent.mockImplementation((_req: any, res: any, _next: any) => {
        return res.status(403).sendEnvelope("student role required", "error");
      });

      const res = await request(app)
        .get(`${BASE}/performance`)
        .expect(403);

      expect(res.body.message).toContain("student role required");
      expect(mockGetStudentPerformance).not.toHaveBeenCalled();
    });
  });
});
