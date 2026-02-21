import { describe, it, expect } from "vitest";
import {
  createOnlineTestSchema,
  updateOnlineTestSchema,
} from "../../../src/shared/validation/onlineTestValidation";

const validObjectId = "507f1f77bcf86cd799439011";

function makeValidSection(overrides: Record<string, unknown> = {}) {
  return {
    name: "Section A",
    questionIds: [validObjectId],
    timeLimit: 0,
    instructions: "",
    canGoBack: true,
    ...overrides,
  };
}

function futureDate(minutesFromNow = 60): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesFromNow);
  return d.toISOString();
}

describe("createOnlineTestSchema", () => {
  // ─── live_mock ─────────────────────────────────────────────────────────

  it("accepts valid live_mock with startTime and duration", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Live Mock Test",
      mode: "live_mock",
      sections: [makeValidSection()],
      scheduling: {
        startTime: futureDate(120),
        duration: 60,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects live_mock without startTime", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Live Mock Test",
      mode: "live_mock",
      sections: [makeValidSection()],
      scheduling: {
        duration: 60,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects live_mock without duration", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Live Mock Test",
      mode: "live_mock",
      sections: [makeValidSection()],
      scheduling: {
        startTime: futureDate(120),
      },
    });
    expect(result.success).toBe(false);
  });

  // ─── anytime_mock ──────────────────────────────────────────────────────

  it("accepts valid anytime_mock with availableFrom and endTime", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Anytime Mock",
      mode: "anytime_mock",
      sections: [makeValidSection()],
      scheduling: {
        availableFrom: futureDate(60),
        endTime: futureDate(1440),
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects anytime_mock when availableFrom >= endTime", () => {
    const sameTime = futureDate(60);
    const result = createOnlineTestSchema.safeParse({
      title: "Anytime Mock",
      mode: "anytime_mock",
      sections: [makeValidSection()],
      scheduling: {
        availableFrom: futureDate(1440),
        endTime: futureDate(60),
      },
    });
    expect(result.success).toBe(false);
  });

  // ─── section_timed ─────────────────────────────────────────────────────

  it("accepts valid section_timed with timeLimit > 0", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Section Timed Test",
      mode: "section_timed",
      sections: [makeValidSection({ timeLimit: 30 })],
    });
    expect(result.success).toBe(true);
  });

  it("rejects section_timed with timeLimit = 0", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Section Timed Test",
      mode: "section_timed",
      sections: [makeValidSection({ timeLimit: 0 })],
    });
    expect(result.success).toBe(false);
  });

  // ─── practice ──────────────────────────────────────────────────────────

  it("accepts valid practice test", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Practice Test",
      mode: "practice",
      sections: [makeValidSection()],
      options: {
        maxAttempts: 1,
        instantFeedback: false,
      },
    });
    expect(result.success).toBe(true);
  });

  // ─── classroom ─────────────────────────────────────────────────────────

  it("accepts valid classroom test", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "Classroom Test",
      mode: "classroom",
      sections: [makeValidSection()],
      assignment: {
        classIds: [validObjectId],
        isPublic: true,
      },
    });
    expect(result.success).toBe(true);
  });

  // ─── General validations ──────────────────────────────────────────────

  it("rejects missing title", () => {
    const result = createOnlineTestSchema.safeParse({
      mode: "practice",
      sections: [makeValidSection()],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sections array", () => {
    const result = createOnlineTestSchema.safeParse({
      title: "No Sections",
      mode: "practice",
      sections: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateOnlineTestSchema", () => {
  it("accepts empty object for partial update", () => {
    const result = updateOnlineTestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial title update", () => {
    const result = updateOnlineTestSchema.safeParse({
      title: "Updated Title",
    });
    expect(result.success).toBe(true);
  });

  it("rejects title exceeding 300 characters", () => {
    const result = updateOnlineTestSchema.safeParse({
      title: "x".repeat(301),
    });
    expect(result.success).toBe(false);
  });
});
