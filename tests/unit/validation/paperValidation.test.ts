import { describe, it, expect } from "vitest";
import {
  createPaperSchema,
  updatePaperSchema,
  autoGenerateSchema,
  swapQuestionSchema,
  addQuestionSchema,
  removeQuestionSchema,
  listPapersQuerySchema,
} from "../../../src/shared/validation/paperValidation";
import {
  createPaperSetSchema,
  updatePaperSetSchema,
  addPaperToSetSchema,
  listPaperSetsQuerySchema,
} from "../../../src/shared/validation/paperSetValidation";

const validObjectId = "507f1f77bcf86cd799439011";

describe("createPaperSchema", () => {
  it("accepts a valid paper with minimal fields", () => {
    const result = createPaperSchema.safeParse({
      title: "Test Paper",
      templateId: validObjectId,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid paper with sections", () => {
    const result = createPaperSchema.safeParse({
      title: "Paper With Sections",
      description: "A test paper",
      templateId: validObjectId,
      sections: [
        {
          name: "Section A",
          instructions: "Answer all questions",
          timeLimit: 30,
          questions: [
            {
              questionId: validObjectId,
              questionNumber: 1,
              marks: 5,
              isRequired: true,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects paper without title", () => {
    const result = createPaperSchema.safeParse({
      templateId: validObjectId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects paper without templateId", () => {
    const result = createPaperSchema.safeParse({
      title: "Missing Template",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid templateId (not ObjectId)", () => {
    const result = createPaperSchema.safeParse({
      title: "Bad Template",
      templateId: "not-a-valid-id",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 300 characters", () => {
    const result = createPaperSchema.safeParse({
      title: "x".repeat(301),
      templateId: validObjectId,
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from title", () => {
    const result = createPaperSchema.safeParse({
      title: "  My Paper  ",
      templateId: validObjectId,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("My Paper");
    }
  });
});

describe("autoGenerateSchema", () => {
  it("accepts valid auto-generate payload", () => {
    const result = autoGenerateSchema.safeParse({
      blueprintId: validObjectId,
      templateId: validObjectId,
      title: "Auto-Generated Paper",
    });
    expect(result.success).toBe(true);
  });

  it("rejects without blueprintId", () => {
    const result = autoGenerateSchema.safeParse({
      templateId: validObjectId,
      title: "Missing Blueprint",
    });
    expect(result.success).toBe(false);
  });

  it("rejects without templateId", () => {
    const result = autoGenerateSchema.safeParse({
      blueprintId: validObjectId,
      title: "Missing Template",
    });
    expect(result.success).toBe(false);
  });

  it("rejects without title", () => {
    const result = autoGenerateSchema.safeParse({
      blueprintId: validObjectId,
      templateId: validObjectId,
    });
    expect(result.success).toBe(false);
  });

  it("accepts override constraints", () => {
    const result = autoGenerateSchema.safeParse({
      blueprintId: validObjectId,
      templateId: validObjectId,
      title: "With Overrides",
      overrideConstraints: {
        excludeRecentlyUsed: false,
        recentlyUsedWindow: 90,
        excludeQuestionIds: [validObjectId],
        requireApprovedOnly: false,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("swapQuestionSchema", () => {
  it("accepts valid swap payload", () => {
    const result = swapQuestionSchema.safeParse({
      sectionIndex: 0,
      questionNumber: 1,
      newQuestionId: validObjectId,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative sectionIndex", () => {
    const result = swapQuestionSchema.safeParse({
      sectionIndex: -1,
      questionNumber: 1,
      newQuestionId: validObjectId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects questionNumber less than 1", () => {
    const result = swapQuestionSchema.safeParse({
      sectionIndex: 0,
      questionNumber: 0,
      newQuestionId: validObjectId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid newQuestionId", () => {
    const result = swapQuestionSchema.safeParse({
      sectionIndex: 0,
      questionNumber: 1,
      newQuestionId: "bad-id",
    });
    expect(result.success).toBe(false);
  });
});

describe("addQuestionSchema", () => {
  it("accepts valid add question payload", () => {
    const result = addQuestionSchema.safeParse({
      sectionIndex: 0,
      question: {
        questionId: validObjectId,
        questionNumber: 1,
        marks: 5,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("removeQuestionSchema", () => {
  it("accepts valid remove question payload", () => {
    const result = removeQuestionSchema.safeParse({
      sectionIndex: 0,
      questionNumber: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("listPapersQuerySchema", () => {
  it("accepts empty query (uses defaults)", () => {
    const result = listPapersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe("createdAt");
      expect(result.data.sortDir).toBe("desc");
    }
  });

  it("accepts valid filter parameters", () => {
    const result = listPapersQuerySchema.safeParse({
      status: "draft",
      search: "math",
      page: "2",
      limit: "50",
      sortBy: "title",
      sortDir: "asc",
    });
    expect(result.success).toBe(true);
  });

  it("coerces string page and limit to numbers", () => {
    const result = listPapersQuerySchema.safeParse({
      page: "3",
      limit: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(10);
    }
  });

  it("rejects invalid status enum", () => {
    const result = listPapersQuerySchema.safeParse({
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit exceeding 100", () => {
    const result = listPapersQuerySchema.safeParse({
      limit: "101",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePaperSchema", () => {
  it("accepts empty object", () => {
    const result = updatePaperSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = updatePaperSchema.safeParse({
      title: "Updated Title",
      totalMarks: 200,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Paper Set Validation Tests ──────────────────────────────────────────────

describe("createPaperSetSchema", () => {
  it("accepts a valid paper set with minimal fields", () => {
    const result = createPaperSetSchema.safeParse({
      title: "Test Paper Set",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid paper set with full fields", () => {
    const result = createPaperSetSchema.safeParse({
      title: "FSCE Mock Test Set",
      shortDescription: "A collection of FSCE mock tests",
      fullDescription: "Contains papers 1, 2, and 3 for FSCE preparation",
      examType: "FSCE",
      yearGroup: "Year 5",
      subjectCategory: "11+ Entrance",
      papers: [{ paperId: validObjectId, order: 0 }],
      pricing: {
        currency: "GBP",
        pricePerPaper: 5.99,
        bundlePrice: 14.99,
        checkingServicePrice: 9.99,
        oneToOneServicePrice: 29.99,
        isFree: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects paper set without title", () => {
    const result = createPaperSetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 300 characters", () => {
    const result = createPaperSetSchema.safeParse({
      title: "x".repeat(301),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid paperId in papers array", () => {
    const result = createPaperSetSchema.safeParse({
      title: "Bad Paper ID",
      papers: [{ paperId: "not-valid", order: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid currency enum", () => {
    const result = createPaperSetSchema.safeParse({
      title: "Bad Currency",
      pricing: { currency: "USD" },
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePaperSetSchema", () => {
  it("accepts empty object", () => {
    const result = updatePaperSetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial pricing update", () => {
    const result = updatePaperSetSchema.safeParse({
      pricing: { pricePerPaper: 7.99 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts imageUrls update", () => {
    const result = updatePaperSetSchema.safeParse({
      imageUrls: ["https://example.com/image1.png"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URL in imageUrls", () => {
    const result = updatePaperSetSchema.safeParse({
      imageUrls: ["not-a-url"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 imageUrls", () => {
    const result = updatePaperSetSchema.safeParse({
      imageUrls: Array.from({ length: 11 }, (_, i) => `https://example.com/img${i}.png`),
    });
    expect(result.success).toBe(false);
  });
});

describe("addPaperToSetSchema", () => {
  it("accepts valid payload", () => {
    const result = addPaperToSetSchema.safeParse({
      paperId: validObjectId,
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with order", () => {
    const result = addPaperToSetSchema.safeParse({
      paperId: validObjectId,
      order: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid paperId", () => {
    const result = addPaperToSetSchema.safeParse({
      paperId: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("listPaperSetsQuerySchema", () => {
  it("accepts empty query with defaults", () => {
    const result = listPaperSetsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe("sortDate");
      expect(result.data.sortDir).toBe("desc");
    }
  });

  it("accepts valid status filter", () => {
    const result = listPaperSetsQuerySchema.safeParse({
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = listPaperSetsQuerySchema.safeParse({
      status: "deleted",
    });
    expect(result.success).toBe(false);
  });
});
