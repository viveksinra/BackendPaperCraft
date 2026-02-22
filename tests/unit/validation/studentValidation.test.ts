import { describe, it, expect } from "vitest";
import {
  studentSignupSchema,
  joinOrgSchema,
  updateStudentProfileSchema,
} from "../../../src/shared/validation/studentValidation";

describe("studentSignupSchema", () => {
  it("accepts a valid signup payload", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects email without @", () => {
    const result = studentSignupSchema.safeParse({
      email: "not-an-email",
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "short",
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 128 characters", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "a".repeat(129),
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty org code", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "",
    });
    expect(result.success).toBe(false);
  });

  it("uppercases org code", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgCode).toBe("ABC123");
    }
  });

  it("trims whitespace from name and email", () => {
    const result = studentSignupSchema.safeParse({
      email: "  Alice@Example.COM  ",
      password: "SecureP@ss1",
      name: "  Alice Smith  ",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
      expect(result.data.name).toBe("Alice Smith");
    }
  });

  it("lowercases email", () => {
    const result = studentSignupSchema.safeParse({
      email: "ALICE@EXAMPLE.COM",
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
    }
  });

  it("rejects email exceeding 255 characters", () => {
    const longLocal = "a".repeat(250);
    const result = studentSignupSchema.safeParse({
      email: `${longLocal}@example.com`,
      password: "SecureP@ss1",
      name: "Alice Smith",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = studentSignupSchema.safeParse({
      email: "alice@example.com",
      password: "SecureP@ss1",
      name: "",
      orgCode: "ORG123",
    });
    expect(result.success).toBe(false);
  });
});

describe("joinOrgSchema", () => {
  it("accepts a valid org code", () => {
    const result = joinOrgSchema.safeParse({ orgCode: "SCHOOL1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty org code", () => {
    const result = joinOrgSchema.safeParse({ orgCode: "" });
    expect(result.success).toBe(false);
  });

  it("uppercases and trims org code", () => {
    const result = joinOrgSchema.safeParse({ orgCode: "  mycode  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgCode).toBe("MYCODE");
    }
  });

  it("rejects org code exceeding 50 characters", () => {
    const result = joinOrgSchema.safeParse({ orgCode: "X".repeat(51) });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentProfileSchema", () => {
  it("allows partial updates with all fields optional", () => {
    const result = updateStudentProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts only name", () => {
    const result = updateStudentProfileSchema.safeParse({ name: "Bob Jones" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Bob Jones");
    }
  });

  it("accepts only yearGroup", () => {
    const result = updateStudentProfileSchema.safeParse({ yearGroup: "Year 6" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.yearGroup).toBe("Year 6");
    }
  });

  it("accepts only school", () => {
    const result = updateStudentProfileSchema.safeParse({ school: "Oak Academy" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.school).toBe("Oak Academy");
    }
  });

  it("accepts a valid dateOfBirth in datetime format", () => {
    const result = updateStudentProfileSchema.safeParse({
      dateOfBirth: "2015-06-15T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid dateOfBirth format", () => {
    const result = updateStudentProfileSchema.safeParse({
      dateOfBirth: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid preferences", () => {
    const result = updateStudentProfileSchema.safeParse({
      preferences: {
        showTimerWarning: true,
        questionFontSize: "large",
        highContrastMode: false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferences?.questionFontSize).toBe("large");
    }
  });

  it("accepts partial preferences", () => {
    const result = updateStudentProfileSchema.safeParse({
      preferences: { highContrastMode: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferences?.highContrastMode).toBe(true);
    }
  });

  it("rejects invalid questionFontSize value", () => {
    const result = updateStudentProfileSchema.safeParse({
      preferences: { questionFontSize: "huge" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 1 character", () => {
    const result = updateStudentProfileSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects school exceeding 200 characters", () => {
    const result = updateStudentProfileSchema.safeParse({
      school: "S".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects yearGroup exceeding 50 characters", () => {
    const result = updateStudentProfileSchema.safeParse({
      yearGroup: "Y".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});
