import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';

// ---- Hoisted Mocks ----

const {
  mockQuestionAnalyticsModel,
  mockTestAttemptModel,
  mockSnapshotModel,
  mockQuestionModel,
  mockPurchaseModel,
  mockOnlineTestModel,
  mockClassModel,
  mockMembershipModel,
} = vi.hoisted(() => {
  const mocks = {
    mockQuestionAnalyticsModel: { findOne: vi.fn(), find: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() } as Record<string, any>,
    mockTestAttemptModel: { find: vi.fn() } as Record<string, any>,
    mockSnapshotModel: { find: vi.fn(), findOneAndUpdate: vi.fn() } as Record<string, any>,
    mockQuestionModel: { find: vi.fn(), findById: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() } as Record<string, any>,
    mockPurchaseModel: { aggregate: vi.fn() } as Record<string, any>,
    mockOnlineTestModel: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), countDocuments: vi.fn() } as Record<string, any>,
    mockClassModel: { find: vi.fn(), findById: vi.fn() } as Record<string, any>,
    mockMembershipModel: { find: vi.fn() } as Record<string, any>,
  };
  const mongoose = require('mongoose');
  mongoose.models.OnlineTest = mocks.mockOnlineTestModel;
  mongoose.models.Class = mocks.mockClassModel;
  mongoose.models.User = {};
  mongoose.models.Student = {};
  mongoose.models.Membership = mocks.mockMembershipModel;
  return mocks;
});

vi.mock('../../../src/models/questionAnalytics', () => ({
  QuestionAnalyticsModel: mockQuestionAnalyticsModel,
}));

vi.mock('../../../src/models/testAttempt', () => ({
  TestAttemptModel: mockTestAttemptModel,
}));

vi.mock('../../../src/models/studentAnalyticsSnapshot', () => ({
  StudentAnalyticsSnapshotModel: mockSnapshotModel,
}));

vi.mock('../../../src/models/question', () => ({
  QuestionModel: mockQuestionModel,
}));

vi.mock('../../../src/models/purchase', () => ({
  PurchaseModel: mockPurchaseModel,
}));

vi.mock('../../../src/shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));


// ---- Helpers ----

function toObjectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function chainable(resolvedValue: unknown) {
  const obj: Record<string, any> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.populate = vi.fn().mockReturnValue(obj);
  obj.select = vi.fn().mockReturnValue(obj);
  return obj;
}

const companyId = toObjectId();
const questionId = toObjectId();

// ---- Import service after mocks ----

import {
  getQuestionAnalytics,
  listQuestionAnalytics,
  getProblematicQuestions,
  getDifficultyCalibrationReport,
} from '../../../src/services/questionAnalyticsService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getQuestionAnalytics ────────────────────────────────────────────

describe('getQuestionAnalytics', () => {
  it('returns cached data if not stale (< 1 hour old)', async () => {
    const recentData = {
      companyId,
      questionId,
      accuracy: 75,
      computedAt: new Date(), // Just computed
    };
    mockQuestionAnalyticsModel.findOne.mockResolvedValue(recentData);

    const result = await getQuestionAnalytics(
      companyId.toString(),
      questionId.toString()
    );

    expect(result).toBe(recentData);
    // computeQuestionAnalytics should NOT have been called
    expect(mockTestAttemptModel.find).not.toHaveBeenCalled();
  });

  it('recomputes when data is stale (> 1 hour old)', async () => {
    const staleDate = new Date();
    staleDate.setHours(staleDate.getHours() - 2); // 2 hours ago

    mockQuestionAnalyticsModel.findOne.mockResolvedValue({
      companyId,
      questionId,
      accuracy: 50,
      computedAt: staleDate,
    });

    // Mock for computeQuestionAnalytics
    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: questionId,
        content: {},
        metadata: {},
        tenantId: 'tenant-1',
      }),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(0);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({
      accuracy: 0,
      computedAt: new Date(),
    });

    await getQuestionAnalytics(companyId.toString(), questionId.toString());

    // Should have triggered recompute
    expect(mockTestAttemptModel.find).toHaveBeenCalled();
  });

  it('recomputes when data is missing', async () => {
    mockQuestionAnalyticsModel.findOne.mockResolvedValue(null);

    mockTestAttemptModel.find.mockReturnValue(chainable([]));
    mockQuestionModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: questionId,
        content: {},
        metadata: {},
        tenantId: 'tenant-1',
      }),
    });
    mockOnlineTestModel.countDocuments.mockResolvedValue(0);
    mockOnlineTestModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    mockQuestionAnalyticsModel.findOneAndUpdate.mockResolvedValue({});

    await getQuestionAnalytics(companyId.toString(), questionId.toString());

    expect(mockTestAttemptModel.find).toHaveBeenCalled();
  });
});

// ─── listQuestionAnalytics ───────────────────────────────────────────

describe('listQuestionAnalytics', () => {
  it('returns paginated results with filters applied', async () => {
    const questions = [
      { questionId: toObjectId(), accuracy: 80, discriminationIndex: 0.5 },
      { questionId: toObjectId(), accuracy: 60, discriminationIndex: 0.3 },
    ];

    const findChain = chainable(questions);
    mockQuestionAnalyticsModel.find.mockReturnValue(findChain);
    mockQuestionAnalyticsModel.countDocuments.mockResolvedValue(10);

    const result = await listQuestionAnalytics(
      companyId.toString(),
      { difficulty: 'medium', accuracyMin: 50 },
      { page: 1, pageSize: 20 }
    );

    expect(result.questions).toHaveLength(2);
    expect(result.total).toBe(10);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('applies discrimination range filter', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue(chainable([]));
    mockQuestionAnalyticsModel.countDocuments.mockResolvedValue(0);

    await listQuestionAnalytics(
      companyId.toString(),
      { discriminationMin: 0.2, discriminationMax: 0.8 },
      { page: 1, pageSize: 10 }
    );

    const findCall = mockQuestionAnalyticsModel.find.mock.calls[0][0];
    expect(findCall.discriminationIndex).toEqual({ $gte: 0.2, $lte: 0.8 });
  });

  it('applies accuracy range filter', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue(chainable([]));
    mockQuestionAnalyticsModel.countDocuments.mockResolvedValue(0);

    await listQuestionAnalytics(
      companyId.toString(),
      { accuracyMin: 30, accuracyMax: 70 },
      { page: 1, pageSize: 10 }
    );

    const findCall = mockQuestionAnalyticsModel.find.mock.calls[0][0];
    expect(findCall.accuracy).toEqual({ $gte: 30, $lte: 70 });
  });
});

// ─── getProblematicQuestions ─────────────────────────────────────────

describe('getProblematicQuestions', () => {
  it('identifies questions with low discrimination index', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.1,
          taggedDifficulty: 'medium',
          actualDifficulty: 'medium',
          accuracy: 50,
          totalAttempts: 10,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(1);
    expect(result[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Low discrimination index')])
    );
  });

  it('identifies questions with difficulty mismatch', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.5,
          taggedDifficulty: 'hard',
          actualDifficulty: 'easy',
          accuracy: 75,
          totalAttempts: 20,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(1);
    expect(result[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Difficulty mismatch')])
    );
  });

  it('identifies questions with very low accuracy (<20%)', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.5,
          taggedDifficulty: 'expert',
          actualDifficulty: 'expert',
          accuracy: 10,
          totalAttempts: 15,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(1);
    expect(result[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Very low accuracy')])
    );
  });

  it('identifies questions with very high accuracy (>95%)', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.5,
          taggedDifficulty: 'easy',
          actualDifficulty: 'easy',
          accuracy: 98,
          totalAttempts: 50,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(1);
    expect(result[0].issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Very high accuracy')])
    );
  });

  it('correctly identifies all three issue types on same question', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.1, // low discrimination
          taggedDifficulty: 'hard',
          actualDifficulty: 'easy', // mismatch
          accuracy: 10, // very low accuracy
          totalAttempts: 20,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(1);
    expect(result[0].issues.length).toBe(3);
  });

  it('sorts by number of issues (most problematic first)', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          questionId: toObjectId(),
          discriminationIndex: 0.5,
          taggedDifficulty: 'easy',
          actualDifficulty: 'easy',
          accuracy: 98, // 1 issue: high accuracy
          totalAttempts: 10,
        },
        {
          questionId: toObjectId(),
          discriminationIndex: 0.1, // + low discrimination
          taggedDifficulty: 'hard',
          actualDifficulty: 'easy', // + mismatch
          accuracy: 15, // + low accuracy
          totalAttempts: 10,
        },
      ]),
    });

    const result = await getProblematicQuestions(companyId.toString());

    expect(result).toHaveLength(2);
    expect(result[0].issues.length).toBeGreaterThan(result[1].issues.length);
  });

  it('respects limit parameter', async () => {
    const questions = Array.from({ length: 30 }, () => ({
      questionId: toObjectId(),
      discriminationIndex: 0.1,
      taggedDifficulty: 'medium',
      actualDifficulty: 'medium',
      accuracy: 50,
      totalAttempts: 10,
    }));

    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue(questions),
    });

    const result = await getProblematicQuestions(companyId.toString(), 5);

    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ─── getDifficultyCalibrationReport ──────────────────────────────────

describe('getDifficultyCalibrationReport', () => {
  it('returns calibration data for all 4 difficulty levels', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { taggedDifficulty: 'easy', accuracy: 85, actualDifficulty: 'easy' },
        { taggedDifficulty: 'easy', accuracy: 75, actualDifficulty: 'easy' },
        { taggedDifficulty: 'medium', accuracy: 55, actualDifficulty: 'medium' },
        { taggedDifficulty: 'hard', accuracy: 40, actualDifficulty: 'hard' },
        { taggedDifficulty: 'expert', accuracy: 20, actualDifficulty: 'expert' },
      ]),
    });

    const result = await getDifficultyCalibrationReport(companyId.toString());

    expect(result.calibration).toHaveLength(4);

    const easy = result.calibration.find((c) => c.taggedDifficulty === 'easy');
    expect(easy).toBeDefined();
    expect(easy!.questionCount).toBe(2);
    expect(easy!.actualAvgAccuracy).toBe(80); // (85+75)/2

    const medium = result.calibration.find((c) => c.taggedDifficulty === 'medium');
    expect(medium!.questionCount).toBe(1);
    expect(medium!.actualAvgAccuracy).toBe(55);
  });

  it('counts questions needing retagging', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { taggedDifficulty: 'easy', accuracy: 30, actualDifficulty: 'hard' }, // mismatch
        { taggedDifficulty: 'easy', accuracy: 85, actualDifficulty: 'easy' }, // match
        { taggedDifficulty: 'easy', accuracy: 25, actualDifficulty: 'expert' }, // mismatch
      ]),
    });

    const result = await getDifficultyCalibrationReport(companyId.toString());

    const easy = result.calibration.find((c) => c.taggedDifficulty === 'easy');
    expect(easy!.needsRetagging).toBe(2);
  });

  it('provides expected accuracy ranges', async () => {
    mockQuestionAnalyticsModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });

    const result = await getDifficultyCalibrationReport(companyId.toString());

    const easy = result.calibration.find((c) => c.taggedDifficulty === 'easy');
    expect(easy!.expectedRange).toEqual({ min: 70, max: 100 });

    const expert = result.calibration.find((c) => c.taggedDifficulty === 'expert');
    expect(expert!.expectedRange).toEqual({ min: 0, max: 30 });
  });
});
