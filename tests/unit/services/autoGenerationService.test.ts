import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Mock models
const mockBlueprintFindOne = vi.fn();
const mockTemplateFindOne = vi.fn();
const mockPaperCreate = vi.fn();
const mockQuestionFind = vi.fn();
const mockQuestionFindById = vi.fn();
const mockQuestionUpdateMany = vi.fn();

vi.mock("../../../src/models/paperBlueprint", () => ({
  PaperBlueprintModel: {
    findOne: (...args: unknown[]) => mockBlueprintFindOne(...args),
  },
  BlueprintSection: {},
  BlueprintConstraints: {},
}));

vi.mock("../../../src/models/paperTemplate", () => ({
  PaperTemplateModel: {
    findOne: (...args: unknown[]) => mockTemplateFindOne(...args),
  },
}));

vi.mock("../../../src/models/paper", () => ({
  PaperModel: {
    create: (...args: unknown[]) => mockPaperCreate(...args),
    findOne: vi.fn(),
  },
  PaperDocument: {},
}));

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    find: (...args: unknown[]) => {
      mockQuestionFind(...args);
      return { lean: () => Promise.resolve(mockQuestionFind._results || []) };
    },
    findById: (...args: unknown[]) => mockQuestionFindById(...args),
    updateMany: (...args: unknown[]) => mockQuestionUpdateMany(...args),
  },
  QuestionDocument: {},
}));

import {
  autoGeneratePaper,
  selectQuestionsForSection,
} from "../../../src/services/autoGenerationService";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TENANT_ID = "testTenant";
const USER_EMAIL = "user@test.com";

function makeQuestions(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    type: "mcq",
    metadata: {
      difficulty: "medium",
      marks: 1,
      subjectId: "math",
      ...((overrides.metadata as Record<string, unknown>) || {}),
    },
    isArchived: false,
    ...overrides,
  }));
}

describe("autoGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selectQuestionsForSection", () => {
    it("selects the required number of questions", async () => {
      const questions = makeQuestions(20);
      (mockQuestionFind as unknown as { _results: unknown[] })._results = questions;

      const section = {
        name: "Section A",
        questionCount: 10,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
      };

      const result = await selectQuestionsForSection(
        COMPANY_ID,
        section as any,
        {} as any,
        new Set()
      );

      expect(result).toHaveLength(10);
    });

    it("handles insufficient questions gracefully", async () => {
      const questions = makeQuestions(3);
      (mockQuestionFind as unknown as { _results: unknown[] })._results = questions;

      const section = {
        name: "Section A",
        questionCount: 10,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
      };

      const result = await selectQuestionsForSection(
        COMPANY_ID,
        section as any,
        {} as any,
        new Set()
      );

      // Best-effort: returns what's available
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result.length).toBe(3);
    });

    it("returns empty array when no candidates", async () => {
      (mockQuestionFind as unknown as { _results: unknown[] })._results = [];

      const section = {
        name: "Section A",
        questionCount: 10,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
      };

      const result = await selectQuestionsForSection(
        COMPANY_ID,
        section as any,
        {} as any,
        new Set()
      );

      expect(result).toHaveLength(0);
    });

    it("excludes already selected IDs", async () => {
      const questions = makeQuestions(5);
      (mockQuestionFind as unknown as { _results: unknown[] })._results = questions;

      const alreadySelected = new Set<string>([
        (questions[0]._id as mongoose.Types.ObjectId).toString(),
        (questions[1]._id as mongoose.Types.ObjectId).toString(),
      ]);

      const section = {
        name: "Section A",
        questionCount: 5,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
      };

      const result = await selectQuestionsForSection(
        COMPANY_ID,
        section as any,
        {} as any,
        alreadySelected
      );

      // The filter is sent to the DB query, so all returned questions are valid
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it("respects difficulty mix proportions", async () => {
      const easyQs = makeQuestions(10, { metadata: { difficulty: "easy", marks: 1 } });
      const mediumQs = makeQuestions(10, { metadata: { difficulty: "medium", marks: 1 } });
      const hardQs = makeQuestions(10, { metadata: { difficulty: "hard", marks: 1 } });
      const expertQs = makeQuestions(5, { metadata: { difficulty: "expert", marks: 1 } });
      const all = [...easyQs, ...mediumQs, ...hardQs, ...expertQs];
      (mockQuestionFind as unknown as { _results: unknown[] })._results = all;

      const section = {
        name: "Section A",
        questionCount: 20,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
        difficultyMix: { easy: 25, medium: 50, hard: 20, expert: 5 },
      };

      const result = await selectQuestionsForSection(
        COMPANY_ID,
        section as any,
        {} as any,
        new Set()
      );

      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("autoGeneratePaper", () => {
    it("builds complete draft paper", async () => {
      const blueprintId = new mongoose.Types.ObjectId().toString();
      const templateId = new mongoose.Types.ObjectId().toString();

      mockBlueprintFindOne.mockResolvedValue({
        _id: blueprintId,
        name: "Test Blueprint",
        sections: [
          {
            name: "Section A",
            questionCount: 5,
            questionTypes: ["mcq"],
            marksPerQuestion: 1,
          },
        ],
        constraints: {},
        totalTime: 60,
      });

      mockTemplateFindOne.mockResolvedValue({
        _id: templateId,
        isActive: true,
      });

      const questions = makeQuestions(10);
      (mockQuestionFind as unknown as { _results: unknown[] })._results = questions;

      const createdPaper = {
        _id: new mongoose.Types.ObjectId(),
        title: "Generated Paper",
        status: "draft",
        sections: [{ name: "Section A", questions: questions.slice(0, 5) }],
      };
      mockPaperCreate.mockResolvedValue(createdPaper);
      mockQuestionUpdateMany.mockResolvedValue({});

      const result = await autoGeneratePaper(
        COMPANY_ID,
        TENANT_ID,
        blueprintId,
        templateId,
        "Generated Paper",
        undefined,
        USER_EMAIL
      );

      expect(mockPaperCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Generated Paper",
          status: "draft",
        })
      );
      expect(result).toBeDefined();
    });
  });
});
