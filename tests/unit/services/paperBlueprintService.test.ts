import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const mockCreate = vi.fn();
const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockSort = vi.fn();
const mockCountDocuments = vi.fn();

vi.mock("../../../src/models/paperBlueprint", () => ({
  PaperBlueprintModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    find: (...args: unknown[]) => {
      mockFind(...args);
      return { sort: mockSort };
    },
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

vi.mock("../../../src/models/question", () => ({
  QuestionModel: {
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
  },
}));

import {
  createBlueprint,
  listBlueprints,
  updateBlueprint,
  cloneBlueprint,
  deleteBlueprint,
  validateBlueprintFeasibility,
} from "../../../src/services/paperBlueprintService";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TENANT_ID = "testTenant";
const USER_EMAIL = "user@test.com";

function makeBlueprintMock(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    companyId: new mongoose.Types.ObjectId(COMPANY_ID),
    name: "Test Blueprint",
    totalMarks: 100,
    totalTime: 60,
    sections: [
      {
        name: "Section A",
        questionCount: 10,
        questionTypes: ["mcq"],
        marksPerQuestion: 1,
        difficultyMix: { easy: 25, medium: 50, hard: 20, expert: 5 },
        topicDistribution: [],
      },
    ],
    constraints: {},
    isPreBuilt: false,
    isActive: true,
    createdBy: USER_EMAIL,
    updatedBy: USER_EMAIL,
    set: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn(),
    ...overrides,
  };
  doc.toObject = vi.fn().mockReturnValue({
    _id: doc._id,
    tenantId: doc.tenantId,
    name: doc.name,
    sections: doc.sections,
    constraints: doc.constraints,
    isPreBuilt: doc.isPreBuilt,
    isActive: doc.isActive,
  });
  return doc;
}

describe("paperBlueprintService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createBlueprint", () => {
    it("creates a blueprint with sections", async () => {
      const mock = makeBlueprintMock();
      mockCreate.mockResolvedValue(mock);

      const result = await createBlueprint(COMPANY_ID, TENANT_ID, {
        name: "Test Blueprint",
        totalMarks: 100,
        totalTime: 60,
        sections: mock.sections,
      }, USER_EMAIL);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Blueprint",
          isPreBuilt: false,
          isActive: true,
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe("updateBlueprint", () => {
    it("blocks updates on pre-built blueprints", async () => {
      const preBuilt = makeBlueprintMock({ isPreBuilt: true });
      mockFindOne.mockResolvedValue(preBuilt);

      await expect(
        updateBlueprint(COMPANY_ID, preBuilt._id.toString(), { name: "Changed" }, USER_EMAIL)
      ).rejects.toThrow("Cannot modify a pre-built blueprint");
    });
  });

  describe("cloneBlueprint", () => {
    it('deep copies with new name and isPreBuilt: false', async () => {
      const source = makeBlueprintMock({ isPreBuilt: true, name: "FSCE Blueprint" });
      mockFindOne.mockResolvedValue(source);
      const cloned = makeBlueprintMock({ name: "FSCE Blueprint (Custom)" });
      mockCreate.mockResolvedValue(cloned);

      const result = await cloneBlueprint(COMPANY_ID, source._id.toString(), USER_EMAIL);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "FSCE Blueprint (Custom)",
          isPreBuilt: false,
        })
      );
      expect(result.name).toBe("FSCE Blueprint (Custom)");
    });
  });

  describe("deleteBlueprint", () => {
    it("blocks deletion of pre-built blueprints", async () => {
      const preBuilt = makeBlueprintMock({ isPreBuilt: true });
      mockFindOne.mockResolvedValue(preBuilt);

      await expect(
        deleteBlueprint(COMPANY_ID, preBuilt._id.toString())
      ).rejects.toThrow("Cannot delete a pre-built blueprint");
    });

    it("soft-deletes custom blueprints", async () => {
      const custom = makeBlueprintMock({ isPreBuilt: false });
      mockFindOne.mockResolvedValue(custom);

      await deleteBlueprint(COMPANY_ID, custom._id.toString());

      expect(custom.isActive).toBe(false);
      expect(custom.save).toHaveBeenCalled();
    });
  });

  describe("validateBlueprintFeasibility", () => {
    it("returns correct available vs. required counts", async () => {
      const bp = makeBlueprintMock({
        sections: [
          { name: "Section A", questionCount: 10, questionTypes: ["mcq"] },
          { name: "Section B", questionCount: 5, questionTypes: ["short-answer"] },
        ],
        constraints: {},
      });
      mockFindOne.mockResolvedValue(bp);
      mockCountDocuments
        .mockResolvedValueOnce(15) // Section A: 15 available
        .mockResolvedValueOnce(3); // Section B: 3 available (shortfall of 2)

      const result = await validateBlueprintFeasibility(COMPANY_ID, bp._id.toString());

      expect(result.feasible).toBe(false);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0]).toEqual(
        expect.objectContaining({ name: "Section A", required: 10, available: 15, shortfall: 0 })
      );
      expect(result.sections[1]).toEqual(
        expect.objectContaining({ name: "Section B", required: 5, available: 3, shortfall: 2 })
      );
    });

    it("returns feasible: true when all sections have enough questions", async () => {
      const bp = makeBlueprintMock({
        sections: [{ name: "Section A", questionCount: 5, questionTypes: ["mcq"] }],
        constraints: {},
      });
      mockFindOne.mockResolvedValue(bp);
      mockCountDocuments.mockResolvedValueOnce(20);

      const result = await validateBlueprintFeasibility(COMPANY_ID, bp._id.toString());

      expect(result.feasible).toBe(true);
      expect(result.sections[0].shortfall).toBe(0);
    });
  });
});
