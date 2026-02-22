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
    findById: vi.fn(),
    create: vi.fn(),
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
    aggregate: vi.fn(),
  },
}));

// ── Mock: ClassModel ────────────────────────────────────────────────────────

vi.mock("../../../src/models/class", () => ({
  ClassModel: {
    find: vi.fn(),
  },
}));

// ── Mock: QuestionModel (used indirectly via mongoose.model) ────────────────

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: vi.fn(),
  },
}));

// ── Legacy CJS mocks ────────────────────────────────────────────────────────
// The service uses require(path.join(__dirname, '..', '..', 'utils/auth')) etc.
// Vitest does not intercept require(), so we patch Module._load to intercept
// these CJS module loads and return our mock objects.

const { mockUser, mockLegacyAuth, mockCompany, mockMembership } = vi.hoisted(() => {
  const mocks = {
    mockUser: {
      findOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    },
    mockLegacyAuth: {
      createPasswordRecord: vi.fn(),
      signToken: vi.fn(),
    },
    mockCompany: {
      findOne: vi.fn(),
      findById: vi.fn(),
    },
    mockMembership: {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
    },
  };

  // Patch Node's Module._load to intercept require() calls for legacy CJS modules
  const Module = require("module");
  const originalLoad = Module._load;
  Module._load = function (request: string, parent: any, isMain: boolean) {
    const normalized = request.replace(/\\/g, "/");
    if (normalized.endsWith("utils/auth") || normalized.includes("utils\\auth")) {
      return mocks.mockLegacyAuth;
    }
    if (normalized.endsWith("Models/User") || normalized.includes("Models\\User")) {
      return mocks.mockUser;
    }
    if (normalized.endsWith("Models/Membership") || normalized.includes("Models\\Membership")) {
      return mocks.mockMembership;
    }
    if (normalized.endsWith("Models/Company") || normalized.includes("Models\\Company")) {
      return mocks.mockCompany;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return mocks;
});

// ── Import mocked modules ───────────────────────────────────────────────────

import { StudentModel } from "../../../src/models/student";
import { ParentLinkModel } from "../../../src/models/parentLink";
import { OnlineTestModel } from "../../../src/models/onlineTest";
import { TestAttemptModel } from "../../../src/models/testAttempt";
import { ClassModel } from "../../../src/models/class";

// ── Import the service under test ───────────────────────────────────────────

import {
  registerParent,
  linkChild,
  unlinkChild,
  getLinkedChildren,
  getParentDashboard,
  getChildTests,
  getChildResults,
  getChildPerformance,
} from "../../../src/services/parentService";

// ── Chainable mock builder ──────────────────────────────────────────────────

function chainable(resolvedValue: unknown) {
  const obj: Record<string, unknown> = {};
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
// 1. registerParent
// ═════════════════════════════════════════════════════════════════════════════

describe("registerParent", () => {
  const userId = oid();

  it("creates user and returns token", async () => {
    mockUser.findOne.mockResolvedValue(null); // no existing user
    mockLegacyAuth.createPasswordRecord.mockReturnValue("hashed-pw");
    mockUser.create.mockResolvedValue({
      _id: userId,
      email: "parent@test.com",
      firstName: "Pat",
    });
    mockLegacyAuth.signToken.mockReturnValue("jwt-parent-token");

    const result = await registerParent("parent@test.com", "pass123", "Pat");

    expect(result).toHaveProperty("user");
    expect(result).toHaveProperty("token", "jwt-parent-token");
    expect(mockUser.create).toHaveBeenCalledOnce();
    expect(mockLegacyAuth.signToken).toHaveBeenCalledWith({
      sub: "parent@test.com",
      role: "parent",
    });
  });

  it("rejects duplicate email with 409", async () => {
    mockUser.findOne.mockResolvedValue({ _id: userId, email: "parent@test.com" });

    await expect(
      registerParent("parent@test.com", "pass123", "Pat")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/already registered/i),
      status: 409,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. linkChild
// ═════════════════════════════════════════════════════════════════════════════

describe("linkChild", () => {
  const parentUserId = oid();
  const studentUserId = oid();
  const studentId = oid();
  const linkId = oid();

  it("creates ParentLink with valid student code", async () => {
    const student = {
      _id: studentId,
      userId: studentUserId,
      studentCode: "STU-ABC234",
      organizations: [
        {
          companyId: oid(),
          tenantId: "acme",
          joinedAt: new Date(),
          role: "student",
          orgName: "Acme",
          isActive: true,
        },
      ],
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    mockUser.findById.mockResolvedValue({
      _id: studentUserId,
      firstName: "Charlie",
    });
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    ); // no existing link
    (ParentLinkModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: linkId,
      parentUserId,
      studentUserId,
      studentId,
      status: "active",
      relationship: "father",
      linkedAt: new Date(),
    });

    const result = await linkChild(
      parentUserId.toString(),
      "STU-ABC234",
      "father"
    );

    expect(result).toHaveProperty("link");
    expect(result).toHaveProperty("studentName", "Charlie");
    expect(result).toHaveProperty("studentOrgs");
    expect(ParentLinkModel.create).toHaveBeenCalledOnce();
  });

  it("rejects invalid student code with 404", async () => {
    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      linkChild(parentUserId.toString(), "STU-ZZZZZZ", "mother")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/no student found/i),
      status: 404,
    });
  });

  it("rejects duplicate active link with 409", async () => {
    const student = {
      _id: studentId,
      userId: studentUserId,
      studentCode: "STU-ABC234",
      organizations: [],
    };

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      student
    );
    mockUser.findById.mockResolvedValue({
      _id: studentUserId,
      firstName: "Charlie",
    });
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: linkId,
      status: "active",
    }); // existing active link

    await expect(
      linkChild(parentUserId.toString(), "STU-ABC234", "father")
    ).rejects.toMatchObject({
      message: expect.stringMatching(/already linked/i),
      status: 409,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. unlinkChild
// ═════════════════════════════════════════════════════════════════════════════

describe("unlinkChild", () => {
  const parentUserId = oid();
  const studentUserId = oid();

  it("sets status to 'revoked' and records revokedAt", async () => {
    const link = {
      _id: oid(),
      parentUserId,
      studentUserId,
      status: "active" as string,
      revokedAt: null as Date | null,
      save: vi.fn().mockResolvedValue(undefined),
    };

    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      link
    );

    const result = await unlinkChild(
      parentUserId.toString(),
      studentUserId.toString()
    );

    expect(result.status).toBe("revoked");
    expect(result.revokedAt).toBeInstanceOf(Date);
    expect(link.save).toHaveBeenCalledOnce();
  });

  it("throws 404 when no active link exists", async () => {
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(
      unlinkChild(parentUserId.toString(), studentUserId.toString())
    ).rejects.toMatchObject({
      message: expect.stringMatching(/link not found/i),
      status: 404,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. getLinkedChildren
// ═════════════════════════════════════════════════════════════════════════════

describe("getLinkedChildren", () => {
  const parentUserId = oid();
  const studentUserId = oid();
  const studentId = oid();

  it("returns only active links with populated student data", async () => {
    const activeLink = {
      _id: oid(),
      parentUserId,
      studentUserId,
      studentId,
      status: "active",
      relationship: "mother",
      linkedAt: new Date("2025-01-01"),
    };

    (ParentLinkModel.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      activeLink,
    ]);

    (StudentModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      studentCode: "STU-AABBCC",
      yearGroup: "Year 10",
      school: "Springfield High",
      organizations: [],
      stats: { currentStreak: 2, totalTestsTaken: 10, averageScore: 72 },
    });

    mockUser.findById.mockResolvedValue({
      _id: studentUserId,
      firstName: "Bart",
      lastName: "Simpson",
    });

    const children = await getLinkedChildren(parentUserId.toString());

    expect(children).toHaveLength(1);
    expect(children[0].student.name).toBe("Bart Simpson");
    expect(children[0].student.studentCode).toBe("STU-AABBCC");
    expect(children[0].relationship).toBe("mother");
    expect(children[0].linkedAt).toEqual(new Date("2025-01-01"));
  });

  it("skips links where student or user is not found", async () => {
    const linkA = {
      _id: oid(),
      parentUserId,
      studentUserId: oid(),
      studentId: oid(),
      status: "active",
      relationship: "father",
      linkedAt: new Date(),
    };
    const linkB = {
      _id: oid(),
      parentUserId,
      studentUserId,
      studentId,
      status: "active",
      relationship: "father",
      linkedAt: new Date(),
    };

    (ParentLinkModel.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      linkA,
      linkB,
    ]);

    // First link: student found but user not found
    (StudentModel.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _id: linkA.studentId, studentCode: "A", yearGroup: "", school: "", organizations: [], stats: {} })
      .mockResolvedValueOnce({ _id: studentId, studentCode: "B", yearGroup: "", school: "", organizations: [], stats: {} });

    mockUser.findById
      .mockResolvedValueOnce(null) // first link: user missing
      .mockResolvedValueOnce({ _id: studentUserId, firstName: "Lisa", lastName: "" });

    const children = await getLinkedChildren(parentUserId.toString());

    // Only the second link should be returned because the first has no user
    expect(children).toHaveLength(1);
    expect(children[0].student.studentCode).toBe("B");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. getParentDashboard
// ═════════════════════════════════════════════════════════════════════════════

describe("getParentDashboard", () => {
  const parentUserId = oid();
  const studentUserId = oid();
  const studentId = oid();
  const testId = oid();

  it("aggregates per-child data with alerts", async () => {
    // Setup linked children (getLinkedChildren is called internally)
    (ParentLinkModel.find as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        _id: oid(),
        parentUserId,
        studentUserId,
        studentId,
        status: "active",
        relationship: "guardian",
        linkedAt: new Date(),
      },
    ]);

    (StudentModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      studentCode: "STU-XXYYZZ",
      yearGroup: "Year 11",
      school: "Test School",
      organizations: [],
      stats: { currentStreak: 2, totalTestsTaken: 5, averageScore: 80 },
    });

    mockUser.findById.mockResolvedValue({
      _id: studentUserId,
      firstName: "Alex",
      lastName: "Smith",
    });

    // Recent attempts
    const recentAttempt = {
      _id: oid(),
      testId,
      studentId,
      attemptNumber: 1,
      status: "graded",
      result: { percentage: 85, marksObtained: 85, totalMarks: 100 },
      submittedAt: new Date(),
    };
    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([recentAttempt])
    );

    // OnlineTestModel.findById for test visibility check
    (OnlineTestModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable({
        _id: testId,
        title: "Chemistry Test",
        options: { showResultsToParents: true },
      })
    );

    // Class lookup for upcoming tests
    (ClassModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([])
    );

    // Upcoming tests
    (OnlineTestModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([
        {
          _id: oid(),
          title: "Physics Mock",
          mode: "live_mock",
          scheduling: { startTime: new Date() },
          status: "scheduled",
        },
      ])
    );

    // Count of recent completed tests (for alerts)
    (TestAttemptModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const dashboard = await getParentDashboard(parentUserId.toString());

    expect(dashboard).toHaveProperty("children");
    expect(dashboard.children).toHaveLength(1);

    const child = dashboard.children[0];
    expect(child.student.name).toBe("Alex Smith");
    expect(child.recentResults).toHaveLength(1);
    expect(child.recentResults[0].testTitle).toBe("Chemistry Test");
    expect(child.upcomingTests).toHaveLength(1);
    expect(child.stats.streak).toBe(2);
    // Should have "new_results" alert since countDocuments > 0
    expect(child.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "new_results" }),
      ])
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. getChildTests
// ═════════════════════════════════════════════════════════════════════════════

describe("getChildTests", () => {
  const parentUserId = oid();
  const childStudentUserId = oid();
  const studentId = oid();

  it("validates parent link before returning data (403 if not linked)", async () => {
    // No active link
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(
      getChildTests(parentUserId.toString(), childStudentUserId.toString())
    ).rejects.toMatchObject({
      message: expect.stringMatching(/not authorized/i),
      status: 403,
    });
  });

  it("returns tests when parent link is valid", async () => {
    // Active link exists
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: oid(),
      parentUserId,
      studentUserId: childStudentUserId,
      status: "active",
    });

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      userId: childStudentUserId,
      organizations: [],
    });

    (ClassModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([])
    );

    const testDoc = {
      _id: oid(),
      title: "English Paper",
      mode: "practice",
      status: "live",
    };
    (OnlineTestModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([testDoc])
    );
    (OnlineTestModel.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await getChildTests(
      parentUserId.toString(),
      childStudentUserId.toString()
    );

    expect(result.tests).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. getChildResults
// ═════════════════════════════════════════════════════════════════════════════

describe("getChildResults", () => {
  const parentUserId = oid();
  const childStudentUserId = oid();
  const studentId = oid();

  beforeEach(() => {
    // Valid parent link
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: oid(),
      parentUserId,
      studentUserId: childStudentUserId,
      status: "active",
    });

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      userId: childStudentUserId,
      organizations: [],
    });
  });

  it("respects showResultsToParents flag -- includes visible results", async () => {
    const visibleTestId = oid();
    const hiddenTestId = oid();

    const attempts = [
      {
        _id: oid(),
        testId: visibleTestId,
        studentId,
        attemptNumber: 1,
        status: "graded",
        submittedAt: new Date(),
        result: { percentage: 90, marksObtained: 90, totalMarks: 100 },
      },
      {
        _id: oid(),
        testId: hiddenTestId,
        studentId,
        attemptNumber: 1,
        status: "graded",
        submittedAt: new Date(),
        result: { percentage: 60, marksObtained: 60, totalMarks: 100 },
      },
    ];

    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable(attempts)
    );

    // First test: visible; second test: hidden from parents
    (OnlineTestModel.findById as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(
        chainable({
          _id: visibleTestId,
          title: "Visible Test",
          options: { showResultsToParents: true },
          companyId: oid(),
        })
      )
      .mockReturnValueOnce(
        chainable({
          _id: hiddenTestId,
          title: "Hidden Test",
          options: { showResultsToParents: false },
          companyId: oid(),
        })
      );

    const result = await getChildResults(
      parentUserId.toString(),
      childStudentUserId.toString()
    );

    // Only the visible test should appear
    expect(result.results).toHaveLength(1);
    expect(result.results[0].testTitle).toBe("Visible Test");
  });

  it("rejects with 403 when parent link is invalid", async () => {
    // Override: no active link
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(
      getChildResults(parentUserId.toString(), childStudentUserId.toString())
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. getChildPerformance
// ═════════════════════════════════════════════════════════════════════════════

describe("getChildPerformance", () => {
  const parentUserId = oid();
  const childStudentUserId = oid();
  const studentId = oid();

  it("returns performance data in expected format", async () => {
    // Valid parent link
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: oid(),
      parentUserId,
      studentUserId: childStudentUserId,
      status: "active",
    });

    (StudentModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: studentId,
      userId: childStudentUserId,
      organizations: [],
    });

    // Score trend aggregation
    (TestAttemptModel.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        // scoreTrendAgg
        { _id: "2025-06-01", score: 75 },
        { _id: "2025-06-02", score: 82 },
      ])
      .mockResolvedValueOnce([
        // subjectAgg
        {
          _id: { subjectId: "math", subjectName: "Mathematics" },
          averageScore: 78.5,
          totalAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([
        // timeAgg
        { avgTimePerQuestion: 45.5, totalQuestions: 100 },
      ])
      .mockResolvedValueOnce([
        // totalTimeAgg
        { avgTotalTime: 2100 },
      ]);

    // Attempts for difficulty analysis
    (TestAttemptModel.find as ReturnType<typeof vi.fn>).mockReturnValue(
      chainable([
        {
          answers: [
            { questionId: oid(), isCorrect: true },
            { questionId: oid(), isCorrect: false },
          ],
        },
      ])
    );

    // Mock mongoose.model("Question") for difficulty lookup
    const mockMongooseModel = vi.spyOn(mongoose, "model");
    mockMongooseModel.mockReturnValue({
      find: vi.fn().mockReturnValue(
        chainable([
          { _id: oid(), metadata: { difficulty: "easy" } },
          { _id: oid(), metadata: { difficulty: "hard" } },
        ])
      ),
    } as any);

    const perf = await getChildPerformance(
      parentUserId.toString(),
      childStudentUserId.toString()
    );

    expect(perf).toHaveProperty("scoreTrend");
    expect(perf).toHaveProperty("subjectBreakdown");
    expect(perf).toHaveProperty("difficultyAnalysis");
    expect(perf).toHaveProperty("timeAnalysis");

    expect(perf.scoreTrend).toHaveLength(2);
    expect(perf.scoreTrend[0]).toHaveProperty("date", "2025-06-01");
    expect(perf.scoreTrend[0]).toHaveProperty("score", 75);

    expect(perf.subjectBreakdown).toHaveLength(1);
    expect(perf.subjectBreakdown[0].subjectName).toBe("Mathematics");

    expect(perf.difficultyAnalysis).toHaveProperty("easy");
    expect(perf.difficultyAnalysis).toHaveProperty("medium");
    expect(perf.difficultyAnalysis).toHaveProperty("hard");

    expect(perf.timeAnalysis).toHaveProperty("averageTimePerQuestion");
    expect(perf.timeAnalysis).toHaveProperty("averageTotalTime");

    mockMongooseModel.mockRestore();
  });

  it("rejects with 403 when parent is not linked", async () => {
    (ParentLinkModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(
      getChildPerformance(
        parentUserId.toString(),
        childStudentUserId.toString()
      )
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});
