import { describe, it, expect } from "vitest";
import {
  parentSignupSchema,
  linkChildSchema,
} from "../../../src/shared/validation/parentValidation";

describe("parentSignupSchema", () => {
  it("accepts a valid signup payload", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = parentSignupSchema.safeParse({
      email: "not-an-email",
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "short",
      name: "Jane Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 128 characters", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "a".repeat(129),
      name: "Jane Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "SecureP@ss1",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("trims and lowercases email", () => {
    const result = parentSignupSchema.safeParse({
      email: "  Parent@EXAMPLE.COM  ",
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("parent@example.com");
    }
  });

  it("trims name", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "SecureP@ss1",
      name: "  Jane Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Jane Doe");
    }
  });

  it("rejects name exceeding 200 characters", () => {
    const result = parentSignupSchema.safeParse({
      email: "parent@example.com",
      password: "SecureP@ss1",
      name: "N".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects email exceeding 255 characters", () => {
    const longLocal = "a".repeat(250);
    const result = parentSignupSchema.safeParse({
      email: `${longLocal}@example.com`,
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(false);
  });
});

describe("linkChildSchema", () => {
  it("accepts a valid link payload", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "STU123",
      relationship: "mother",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty student code", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "",
      relationship: "father",
    });
    expect(result.success).toBe(false);
  });

  it("uppercases student code", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "abc789",
      relationship: "other",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studentCode).toBe("ABC789");
    }
  });

  it("trims student code", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "  code1  ",
      relationship: "guardian",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studentCode).toBe("CODE1");
    }
  });

  it("defaults relationship to guardian when not provided", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "STU456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relationship).toBe("guardian");
    }
  });

  it("rejects invalid relationship value", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "STU123",
      relationship: "sibling",
    });
    expect(result.success).toBe(false);
  });

  it("rejects student code exceeding 20 characters", () => {
    const result = linkChildSchema.safeParse({
      studentCode: "X".repeat(21),
      relationship: "mother",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid relationship values", () => {
    const relationships = ["mother", "father", "guardian", "other"] as const;
    for (const relationship of relationships) {
      const result = linkChildSchema.safeParse({
        studentCode: "STU001",
        relationship,
      });
      expect(result.success).toBe(true);
    }
  });
});
