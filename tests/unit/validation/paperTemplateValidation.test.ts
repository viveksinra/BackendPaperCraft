import { describe, it, expect } from "vitest";
import {
  createPaperTemplateSchema,
  updatePaperTemplateSchema,
} from "../../../src/shared/validation/paperTemplateValidation";

describe("createPaperTemplateSchema", () => {
  it("accepts a valid minimal template", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "My Template",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid complete template with full layout", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "Full Template",
      description: "A complete template",
      layout: {
        header: {
          showLogo: true,
          logoPosition: "center",
          title: "Exam Paper",
          subtitle: "Mock Test",
          studentInfoFields: ["Name", "Date", "School"],
        },
        instructions: {
          show: true,
          text: "Read carefully.",
          position: "before_sections",
        },
        sections: {
          numberingStyle: "alpha",
          showSectionHeaders: true,
          pageBreakBetweenSections: true,
        },
        footer: {
          showPageNumbers: true,
          copyrightText: "2025 PaperCraft",
          showWatermark: true,
          watermarkText: "SAMPLE",
        },
        formatting: {
          paperSize: "A4",
          margins: { top: 25, right: 20, bottom: 25, left: 20 },
          fontSize: 14,
          fontFamily: "Times New Roman",
          lineSpacing: 1.5,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects template without name", () => {
    const result = createPaperTemplateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects template with empty name", () => {
    const result = createPaperTemplateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects fontSize outside 8-24 range", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "Test",
      layout: {
        formatting: { fontSize: 7 },
      },
    });
    expect(result.success).toBe(false);

    const result2 = createPaperTemplateSchema.safeParse({
      name: "Test",
      layout: {
        formatting: { fontSize: 25 },
      },
    });
    expect(result2.success).toBe(false);
  });

  it("rejects margins exceeding 100mm", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "Test",
      layout: {
        formatting: {
          margins: { top: 101, right: 15, bottom: 20, left: 15 },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid logoPosition enum", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "Test",
      layout: {
        header: { logoPosition: "top" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid paperSize enum", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "Test",
      layout: {
        formatting: { paperSize: "B5" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name", () => {
    const result = createPaperTemplateSchema.safeParse({
      name: "  My Template  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Template");
    }
  });
});

describe("updatePaperTemplateSchema", () => {
  it("accepts empty object (no fields required)", () => {
    const result = updatePaperTemplateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial layout updates", () => {
    const result = updatePaperTemplateSchema.safeParse({
      layout: {
        header: { title: "Updated Title" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial nested formatting updates", () => {
    const result = updatePaperTemplateSchema.safeParse({
      layout: {
        formatting: {
          fontSize: 14,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial margin updates", () => {
    const result = updatePaperTemplateSchema.safeParse({
      layout: {
        formatting: {
          margins: { top: 30 },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects fontSize out of range in update", () => {
    const result = updatePaperTemplateSchema.safeParse({
      layout: {
        formatting: { fontSize: 4 },
      },
    });
    expect(result.success).toBe(false);
  });
});
