import { describe, it, expect } from "vitest";
import {
  submitAnswerSchema,
  gradeAnswerSchema,
  bulkGradeSchema,
} from "../../../src/shared/validation/testTakingValidation";

const validObjectId = "507f1f77bcf86cd799439011";

describe("submitAnswerSchema", () => {
  it("accepts a string answer", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: validObjectId,
      answer: "My answer text",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a number answer", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: validObjectId,
      answer: 42,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a boolean answer", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: validObjectId,
      answer: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a string array answer", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: validObjectId,
      answer: ["option A", "option C"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null answer (clearing selection)", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: validObjectId,
      answer: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing questionId", () => {
    const result = submitAnswerSchema.safeParse({
      answer: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid questionId format", () => {
    const result = submitAnswerSchema.safeParse({
      questionId: "not-a-valid-id",
      answer: "test",
    });
    expect(result.success).toBe(false);
  });
});

describe("gradeAnswerSchema", () => {
  it("accepts valid marks with feedback", () => {
    const result = gradeAnswerSchema.safeParse({
      attemptId: validObjectId,
      questionId: validObjectId,
      marks: 5,
      feedback: "Good answer",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero marks", () => {
    const result = gradeAnswerSchema.safeParse({
      attemptId: validObjectId,
      questionId: validObjectId,
      marks: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative marks", () => {
    const result = gradeAnswerSchema.safeParse({
      attemptId: validObjectId,
      questionId: validObjectId,
      marks: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing attemptId", () => {
    const result = gradeAnswerSchema.safeParse({
      questionId: validObjectId,
      marks: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("bulkGradeSchema", () => {
  it("accepts valid bulk grade with one entry", () => {
    const result = bulkGradeSchema.safeParse({
      questionId: validObjectId,
      grades: [
        {
          attemptId: validObjectId,
          marks: 4,
          feedback: "Well done",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple grade entries", () => {
    const result = bulkGradeSchema.safeParse({
      questionId: validObjectId,
      grades: [
        { attemptId: validObjectId, marks: 4 },
        { attemptId: "607f1f77bcf86cd799439022", marks: 3, feedback: "ok" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least 1 grade entry", () => {
    const result = bulkGradeSchema.safeParse({
      questionId: validObjectId,
      grades: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative marks in grade entry", () => {
    const result = bulkGradeSchema.safeParse({
      questionId: validObjectId,
      grades: [
        { attemptId: validObjectId, marks: -2 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
