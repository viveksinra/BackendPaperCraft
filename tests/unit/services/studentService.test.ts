import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ── Helpers for ObjectId generation ──────────────────────────────────────────

function oid(hex?: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(hex ?? undefined);
}

// ── Mock: StudentModel ──────────────────────────────────────────────────────

vi.mock("../../../src/models/student", () => ({
  StudentModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  },
}));

// ── Mock: OnlineTestModel ───────────────────────────────────────────────────

vi.mock("../../../src/models/onlineTest", () => ({
  OnlineTestModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

// ── Mock: TestAttemptModel ──────────────────────────────────────────────────

vi.mock("../../../src/models/testAttempt", () => ({
  TestAttemptModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

// ── Mock: QuestionModel ─────────────────────────────────────────────────────

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: vi.fn(),
  },
}));

// ── Mock: ClassModel ────────────────────────────────────────────────────────

vi.mock("../../../src/models/class", () => ({
  ClassModel: {
    find: vi.fn(),
  },
}));

// ── Mock: ParentLinkModel ───────────────────────────────────────────────────

vi.mock("../../../src/models/parentLink", () => ({
  ParentLinkModel: {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
  },
}));

// ── Mock: path (for legacy CJS require redirects) ───────────────────────────

const mockUser = {
  findOne: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
};

const mockMembership = {
  findOne: vi.fn(),
  create: vi.fn(),
};

const mockCompany = {
  findOne: vi.fn(),
};

const mockLegacyAuth = {
  createPasswordRecord: vi.fn(),
  signToken: vi.fn(),
};

// Intercept legacy require() calls that the service performs via path.join
vi.mock("path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("path")>();
  return {
    ...actual,
    default: {
      ...actual,
      join: (...segments: string[]) => {
        const joined = segments.join("/");
        if (joined.includes("utils/auth")) return "__mock__/auth";
        if (joined.includes("Models/User")) return "__mock__/User";
        if (joined.includes("Models/Membership")) return "__mock__/Membership";
        if (joined.includes("Models/Company")) return "__mock__/Company";
        return actual.join(...segments);
      },
    },
    join: (...segments: string[]) => {
      const joined = segments.join("/");
      if (joined.includes("utils/auth")) return "__mock__/auth";
      if (joined.includes("Models/User")) return "__mock__/User";
      if (joined.includes("Models/Membership")) return "__mock__/Membership";
      if (joined.includes("Models/Company")) return "__mock__/Company";
      return actual.join(...segments);
    },
  };
});

vi.mock("__mock__/auth", () => mockLegacyAuth);
vi.mock("__mock__/User", () => ({ default: mockUser, ...mockUser }));
vi.mock("__mock__/Membership", () => ({
  default: mockMembership,
  ...mockMembership,
}));
vi.mock("__mock__/Company", () => ({ default: mockCompany, ...mockCompany }));

// ── Import mocked modules so we can configure return values ─────────────────

import { StudentModel } from "../../../src/models/student";
import { OnlineTestModel } from "../../../src/models/onlineTest";
import { TestAttemptModel } from "../../../src/models/testAttempt";
import { QuestionModel } from "../../../src/models/question";
import { ClassModel } from "../../../src/models/class";

// ── Import the service under test ───────────────────────────────────────────

import {
  generateStudentCode,
  registerStudent,
  joinOrganization,
  getStudentDashboard,
  getStudentTests,
  getStudentResults,
  getStudentResultDetail,
  updateStudentStreak,
} from "../../../src/services/studentService";

// ── Chainable mock builder ──────────────────────────────────────────────────

function chainable(resolvedValue: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.select = vi.fn().mockReturnValue(obj);
  obj.populate = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return obj;
}

// ── Reset all mocks between tests ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. generateStudentCode
// ═════════════════════════════════════════════════════════════════════════════

describe("generateStudentCode", () => {
  it("produces codes matching pattern STU-[A-Z2-9]{6} (no O/0/I/1)", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const code = await generateStudentCode();

    expect(code).toMatch(/^STU-[A-Z2-9]{6}$/);
    // Must not contain ambiguous chars
    expect(code).not.toMatch(/[O01I]/);
  });

  it("retries on collision and produces a unique code", async () => {
    // First two calls find an existing student (collision), third returns null
    (StudentModel.findOne as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ studentCode: "STU-AAAAAA" })
      .mockResolvedValueOnce({ studentCode: "STU-BBBBBB" })
      .mockResolvedValueOnce(null);

    const code = await generateStudentCode();

    expect(code).toMatch(/^STU-[A-Z2-9]{6}$/);
    expect(StudentModel.findOne).toHaveBeenCalledTimes(3);
  });

  it("throws after exceeding maximum retries", async () => {
    // Always collide
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      studentCode: "exists",
    });

    await expect(generateStudentCode()).rejects.toThrow(
      /unique student code/i
    );
    expect(StudentModel.findOne).toHaveBeenCalledTimes(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. registerStudent
// ═════════════════════════════════════════════════════════════════════════════

describe("registerStudent", () => {
  const companyId = oid();
  const userId = oid();
  const studentId = oid();

  beforeEach(() => {
    mockCompany.findOne.mockResolvedValue({
      _id: companyId,
      slug: "acme",
      name: "Acme Corp",
    });
    mockUser.findOne.mockResolvedValue(null); // no duplicate
    mockLegacyAuth.createPasswordRecord.mockReturnValue("hashed");
    mockUser.create.mockResolvedValue({
      _id: userId,
      email: "s@test.com",
    });
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null); // code gen
    (StudentModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      userId,
      studentCode: "STU-XXXXXX",
      organizations: [],
    });
    mockMembership.create.mockResolvedValue({});
    mockLegacyAuth.signToken.mockReturnValue("jwt-token-123");
  });

  it("creates user + student + membership and returns token", async () => {
    const result = await registerStudent(
      "s@test.com",
      "pass123",
      "Stu",
      "ACME"
    );

    expect(result).toHaveProperty("user");
    expect(result).toHaveProperty("student");
    expect(result).toHaveProperty("token", "jwt-token-123");
    expect(mockUser.create).toHaveBeenCalledOnce();
    expect(StudentModel.create).toHaveBeenCalledOnce();
    expect(mockMembership.create).toHaveBeenCalledOnce();
  });

  it("generates a unique student code", async () => {
    await registerStudent("s@test.com", "pass123", "Stu", "ACME");

    // The service calls generateStudentCode internally, which calls findOne
    expect(StudentModel.findOne).toHaveBeenCalled();
    // create should receive a studentCode matching the pattern
    const createCall = (StudentModel.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(createCall.studentCode).toBeDefined();
  });

  it("rejects invalid org code with 404", async () => {
    mockCompany.findOne.mockResolvedValue(null);

    await expect(
      registerStudent("s@test.com", "pass123", "Stu", "BADORG")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/invalid organization/i),
      status: 404,
    });
  });

  it("rejects duplicate email with 409", async () => {
    mockUser.findOne.mockResolvedValue({ _id: oid(), email: "s@test.com" });

    await expect(
      registerStudent("s@test.com", "pass123", "Stu", "ACME")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/already registered/i),
      status: 409,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. joinOrganization
// ═════════════════════════════════════════════════════════════════════════════

describe("joinOrganization", () => {
  const userId = oid();
  const companyId = oid();
  const otherCompanyId = oid();

  function makeStudent(orgs: Array<{ companyId: mongoose.Types.ObjectId }>) {
    return {
      _id: oid(),
      userId,
      organizations: orgs.map((o) => ({
        companyId: o.companyId,
        tenantId: "t",
        joinedAt: new Date(),
        role: "student",
        orgName: "Org",
        isActive: true,
      })),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("adds org to student organizations array", async () => {
    const student = makeStudent([{ companyId: otherCompanyId }]);
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    mockCompany.findOne.mockResolvedValue({
      _id: companyId,
      slug: "new-org",
      name: "New Org",
    });
    mockMembership.findOne.mockResolvedValue(null);
    mockUser.findById.mockResolvedValue({ email: "u@test.com" });
    mockMembership.create.mockResolvedValue({});

    const result = await joinOrganization(userId.toString(), "NEW-ORG");

    expect(student.organizations).toHaveLength(2);
    expect(student.save).toHaveBeenCalledOnce();
    expect(result).toBe(student);
  });

  it("rejects if already a member with 409", async () => {
    const student = makeStudent([{ companyId }]);
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    mockCompany.findOne.mockResolvedValue({
      _id: companyId,
      slug: "acme",
      name: "Acme",
    });

    await expect(
      joinOrganization(userId.toString(), "ACME")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/already a member/i),
      status: 409,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. getStudentDashboard
// ═════════════════════════════════════════════════════════════════════════════

describe("getStudentDashboard", () => {
  const userId = oid();
  const studentId = oid();
  const companyId = oid();

  it("aggregates upcoming tests and recent results", async () => {
    const student = {
      _id: studentId,
      userId,
      organizations: [{ companyId, isActive: true }],
      stats: { totalTestsTaken: 5, averageScore: 75, currentStreak: 3 },
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    // ClassModel.find -> chainable returning class IDs
    const classId = oid();
    (ClassModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([{ _id: classId }])
    );

    // OnlineTestModel.find -> chainable returning upcoming tests
    const upcomingTest = {
      _id: oid(),
      title: "Math Mock",
      mode: "live_mock",
      status: "scheduled",
      scheduling: { startTime: new Date() },
      companyId,
    };
    (OnlineTestModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([upcomingTest])
    );

    // TestAttemptModel.find -> chainable returning recent results
    const recentAttempt = {
      _id: oid(),
      testId: { _id: oid(), title: "English Test", mode: "practice" },
      result: { percentage: 80, marksObtained: 40, totalMarks: 50 },
      submittedAt: new Date(),
    };
    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([recentAttempt])
    );

    const dashboard = await getStudentDashboard(userId.toString());

    expect(dashboard).toHaveProperty("upcomingTests");
    expect(dashboard).toHaveProperty("recentResults");
    expect(dashboard).toHaveProperty("stats");
    expect(dashboard.upcomingTests).toHaveLength(1);
    expect(dashboard.recentResults).toHaveLength(1);
    expect((dashboard.recentResults as any[])[0].testName).toBe(
      "English Test"
    );
    expect((dashboard.recentResults as any[])[0].score).toBe(80);
  });

  it("throws 404 when student not found", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      getStudentDashboard(userId.toString())
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. getStudentTests
// ═════════════════════════════════════════════════════════════════════════════

describe("getStudentTests", () => {
  const userId = oid();
  const studentId = oid();
  const companyId = oid();

  const student = {
    _id: studentId,
    userId,
    organizations: [{ companyId, isActive: true }],
  };

  it("filters by status and org", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    (ClassModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([])
    );

    const testDoc = {
      _id: oid(),
      title: "Test 1",
      mode: "practice",
      status: "live",
      scheduling: {},
      companyId,
      totalMarks: 100,
      totalQuestions: 50,
    };

    (OnlineTestModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([testDoc])
    );
    (OnlineTestModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await getStudentTests(userId.toString(), {
      status: "available",
      orgId: companyId.toString(),
    });

    expect(result.tests).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("returns completed tests from TestAttemptModel", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    (ClassModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([])
    );

    const attempt = {
      _id: oid(),
      testId: { _id: oid(), title: "Done Test", mode: "practice" },
      result: { percentage: 90 },
      submittedAt: new Date(),
    };

    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([attempt])
    );
    (TestAttemptModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await getStudentTests(userId.toString(), {
      status: "completed",
    });

    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].status).toBe("completed");
    expect(result.tests[0].title).toBe("Done Test");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. getStudentResults
// ═════════════════════════════════════════════════════════════════════════════

describe("getStudentResults", () => {
  const userId = oid();
  const studentId = oid();

  it("returns paginated results", async () => {
    const student = {
      _id: studentId,
      userId,
      organizations: [{ companyId: oid(), isActive: true }],
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const attempts = Array.from({ length: 3 }, (_, i) => ({
      _id: oid(),
      testId: { _id: oid(), title: `Test ${i + 1}`, mode: "practice" },
      result: { percentage: 70 + i * 5 },
      submittedAt: new Date(),
    }));

    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable(attempts)
    );
    (TestAttemptModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const result = await getStudentResults(userId.toString(), undefined, {
      page: 1,
      pageSize: 2,
    });

    expect(result.results).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });

  it("throws 404 when student not found", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      getStudentResults(userId.toString())
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. getStudentResultDetail
// ═════════════════════════════════════════════════════════════════════════════

describe("getStudentResultDetail", () => {
  const userId = oid();
  const studentId = oid();
  const testId = oid();
  const questionId = oid();

  const student = { _id: studentId, userId };

  const attempt = {
    _id: oid(),
    testId,
    studentId,
    attemptNumber: 1,
    status: "graded",
    startedAt: new Date(),
    submittedAt: new Date(),
    result: { totalMarks: 100, marksObtained: 80, percentage: 80 },
    answers: [
      {
        questionId,
        sectionIndex: 0,
        answer: "B",
        isCorrect: true,
        marksAwarded: 5,
        maxMarks: 5,
        timeSpent: 30,
        feedback: "Well done",
      },
    ],
  };

  it("includes question content in breakdown", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    (TestAttemptModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockResolvedValue(attempt),
    });
    (OnlineTestModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: testId,
      title: "Math Final",
      mode: "live_mock",
      options: { showSolutionsAfterCompletion: true },
    });
    (QuestionModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: questionId,
          type: "mcq",
          content: {
            text: "What is 2+2?",
            correctAnswer: "4",
            solution: "Simple addition.",
          },
        },
      ]),
    });

    const detail = await getStudentResultDetail(
      userId.toString(),
      testId.toString()
    );

    expect(detail.breakdown).toHaveLength(1);
    expect((detail.breakdown as any[])[0].questionContent).toBe("What is 2+2?");
    expect((detail.breakdown as any[])[0].correctAnswer).toBe("4");
    expect((detail.breakdown as any[])[0].solution).toBe("Simple addition.");
    expect(detail.showSolutions).toBe(true);
  });

  it("respects showSolutions flag -- hides solutions when false", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    (TestAttemptModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockResolvedValue(attempt),
    });
    (OnlineTestModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: testId,
      title: "Math Final",
      mode: "live_mock",
      options: { showSolutionsAfterCompletion: false },
    });
    (QuestionModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: questionId,
          type: "mcq",
          content: {
            text: "What is 2+2?",
            correctAnswer: "4",
            solution: "Simple addition.",
          },
        },
      ]),
    });

    const detail = await getStudentResultDetail(
      userId.toString(),
      testId.toString()
    );

    expect(detail.showSolutions).toBe(false);
    expect((detail.breakdown as any[])[0]).not.toHaveProperty("correctAnswer");
    expect((detail.breakdown as any[])[0]).not.toHaveProperty("solution");
  });

  it("throws 404 when attempt not found", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    (TestAttemptModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockResolvedValue(null),
    });

    await expect(
      getStudentResultDetail(userId.toString(), testId.toString())
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. updateStudentStreak
// ═════════════════════════════════════════════════════════════════════════════

describe("updateStudentStreak", () => {
  const userId = oid();
  const studentId = oid();

  it("increments on consecutive days", async () => {
    vi.useFakeTimers();
    // Set "today" to 2025-06-15T12:00:00Z
    const today = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(today);

    const yesterday = new Date("2025-06-14T10:00:00Z");

    const student = {
      _id: studentId,
      userId,
      stats: {
        currentStreak: 3,
        longestStreak: 5,
        lastActivityAt: yesterday,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const result = await updateStudentStreak(userId.toString());

    expect(result.stats.currentStreak).toBe(4);
    expect(student.save).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("resets if gap > 1 day", async () => {
    vi.useFakeTimers();
    const today = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(today);

    const threeDaysAgo = new Date("2025-06-12T10:00:00Z");

    const student = {
      _id: studentId,
      userId,
      stats: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityAt: threeDaysAgo,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const result = await updateStudentStreak(userId.toString());

    expect(result.stats.currentStreak).toBe(1);
    expect(student.save).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("sets streak to 1 when no previous activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const student = {
      _id: studentId,
      userId,
      stats: {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityAt: null,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const result = await updateStudentStreak(userId.toString());

    expect(result.stats.currentStreak).toBe(1);

    vi.useRealTimers();
  });

  it("does not change streak when activity is same day", async () => {
    vi.useFakeTimers();
    const today = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(today);

    const earlierToday = new Date("2025-06-15T08:00:00Z");

    const student = {
      _id: studentId,
      userId,
      stats: {
        currentStreak: 3,
        longestStreak: 5,
        lastActivityAt: earlierToday,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const result = await updateStudentStreak(userId.toString());

    // Same day: streak unchanged, save not called
    expect(result.stats.currentStreak).toBe(3);

    vi.useRealTimers();
  });

  it("updates longestStreak when currentStreak exceeds it", async () => {
    vi.useFakeTimers();
    const today = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(today);

    const yesterday = new Date("2025-06-14T08:00:00Z");

    const student = {
      _id: studentId,
      userId,
      stats: {
        currentStreak: 5,
        longestStreak: 5,
        lastActivityAt: yesterday,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );

    const result = await updateStudentStreak(userId.toString());

    expect(result.stats.currentStreak).toBe(6);
    expect(result.stats.longestStreak).toBe(6);

    vi.useRealTimers();
  });
});
