import { describe, it, expect } from "vitest";
import {
  createPaperBlueprintSchema,
  updatePaperBlueprintSchema,
} from "../../../src/shared/validation/paperBlueprintValidation";

const validSection = {
  name: "Section A",
  questionCount: 10,
  questionTypes: ["mcq"],
  marksPerQuestion: 2,
};

describe("createPaperBlueprintSchema", () => {
  it("accepts a valid blueprint with minimal section", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Test Blueprint",
      totalMarks: 100,
      totalTime: 60,
      sections: [validSection],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid blueprint with full section details", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Full Blueprint",
      description: "A detailed blueprint",
      totalMarks: 100,
      totalTime: 60,
      sections: [
        {
          name: "Section A",
          questionCount: 20,
          questionTypes: ["mcq", "true_false"],
          marksPerQuestion: 1,
          mixedMarks: false,
          timeLimit: 30,
          topicDistribution: [
            { topicId: "507f1f77bcf86cd799439011", percentage: 60 },
            { topicId: "507f1f77bcf86cd799439012", percentage: 40 },
          ],
          difficultyMix: { easy: 30, medium: 40, hard: 20, expert: 10 },
          instructions: "Answer all questions.",
          subjectId: "507f1f77bcf86cd799439013",
        },
      ],
      constraints: {
        excludeRecentlyUsed: true,
        recentlyUsedWindow: 60,
        excludeQuestionIds: ["507f1f77bcf86cd799439014"],
        requireApprovedOnly: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects blueprint without name", () => {
    const result = createPaperBlueprintSchema.safeParse({
      totalMarks: 100,
      totalTime: 60,
      sections: [validSection],
    });
    expect(result.success).toBe(false);
  });

  it("rejects blueprint without sections", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "No Sections",
      totalMarks: 100,
      totalTime: 60,
      sections: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sections with 0 questionCount", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Bad Section",
      totalMarks: 100,
      totalTime: 60,
      sections: [{ ...validSection, questionCount: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sections with empty questionTypes", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Bad Types",
      totalMarks: 100,
      totalTime: 60,
      sections: [{ ...validSection, questionTypes: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects difficulty mix not summing to 100", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Bad Mix",
      totalMarks: 100,
      totalTime: 60,
      sections: [
        {
          ...validSection,
          difficultyMix: { easy: 30, medium: 30, hard: 30, expert: 5 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts difficulty mix summing to 100", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Good Mix",
      totalMarks: 100,
      totalTime: 60,
      sections: [
        {
          ...validSection,
          difficultyMix: { easy: 25, medium: 50, hard: 20, expert: 5 },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects topic distribution not summing to 100", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Bad Topics",
      totalMarks: 100,
      totalTime: 60,
      sections: [
        {
          ...validSection,
          topicDistribution: [
            { topicId: "507f1f77bcf86cd799439011", percentage: 60 },
            { topicId: "507f1f77bcf86cd799439012", percentage: 30 },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts blueprint with optional topic distribution omitted", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "No Topics",
      totalMarks: 100,
      totalTime: 60,
      sections: [validSection],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty topic distribution array", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Empty Topics",
      totalMarks: 100,
      totalTime: 60,
      sections: [{ ...validSection, topicDistribution: [] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects totalMarks of 0", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Zero Marks",
      totalMarks: 0,
      totalTime: 60,
      sections: [validSection],
    });
    expect(result.success).toBe(false);
  });

  it("rejects totalTime exceeding 600", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Too Long",
      totalMarks: 100,
      totalTime: 601,
      sections: [validSection],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 sections", () => {
    const sections = Array.from({ length: 21 }, (_, i) => ({
      ...validSection,
      name: `Section ${i + 1}`,
    }));
    const result = createPaperBlueprintSchema.safeParse({
      name: "Too Many Sections",
      totalMarks: 100,
      totalTime: 60,
      sections,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ObjectId in topicDistribution", () => {
    const result = createPaperBlueprintSchema.safeParse({
      name: "Bad ObjectId",
      totalMarks: 100,
      totalTime: 60,
      sections: [
        {
          ...validSection,
          topicDistribution: [
            { topicId: "not-an-objectid", percentage: 100 },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePaperBlueprintSchema", () => {
  it("accepts empty object (no fields required)", () => {
    const result = updatePaperBlueprintSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only name", () => {
    const result = updatePaperBlueprintSchema.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial constraints update", () => {
    const result = updatePaperBlueprintSchema.safeParse({
      constraints: { recentlyUsedWindow: 90 },
    });
    expect(result.success).toBe(true);
  });
});
