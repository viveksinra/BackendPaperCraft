import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs to return fake CSS
vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue("body { margin: 0; }"),
  },
  readFileSync: vi.fn().mockReturnValue("body { margin: 0; }"),
}));

// Mock puppeteer (not used in HTML builder tests but needed for module load)
vi.mock("puppeteer", () => ({
  default: { launch: vi.fn() },
}));

// Mock S3
vi.mock("../../../src/utils/s3", () => ({
  uploadPdfToS3: vi.fn(),
}));

// Mock models
vi.mock("../../../src/models/paper", () => ({
  PaperModel: { findById: vi.fn() },
  PdfType: {},
}));
vi.mock("../../../src/models/paperTemplate", () => ({
  PaperTemplateModel: { findById: vi.fn() },
}));

import {
  buildQuestionPaperHtml,
  buildAnswerSheetHtml,
  buildSolutionPaperHtml,
  applyWatermark,
  applyBranding,
} from "../../../src/services/pdfGenerationService";

function makeTemplate(overrides: Record<string, unknown> = {}): any {
  return {
    layout: {
      header: {
        title: "Test Exam",
        subtitle: "Year 10 Mathematics",
        showLogo: true,
        logoPosition: "left",
        studentInfoFields: ["Name", "Date", "Class"],
      },
      instructions: {
        show: true,
        text: "Answer all questions. Show your working.",
      },
      footer: {
        copyrightText: "© 2025 PaperCraft",
        showPageNumbers: true,
        showWatermark: false,
        watermarkText: "",
      },
      formatting: {
        fontFamily: "Times New Roman",
        fontSize: 14,
        lineSpacing: 1.6,
        paperSize: "A4",
        margins: { top: 25, right: 20, bottom: 25, left: 20 },
      },
      sections: {
        showSectionHeaders: true,
        numberingStyle: "alpha",
        pageBreakBetweenSections: false,
      },
      ...((overrides.layout as Record<string, unknown>) || {}),
    },
    ...overrides,
  };
}

function makePaper(overrides: Record<string, unknown> = {}): any {
  return {
    title: "Sample Paper",
    sections: [
      {
        name: "Multiple Choice",
        instructions: "Choose the correct answer.",
        questions: [
          {
            questionId: {
              _id: "q1",
              type: "mcq",
              content: {
                text: "What is 2 + 2?",
                options: [
                  { text: "3" },
                  { text: "4" },
                  { text: "5" },
                  { text: "6" },
                ],
                correctAnswer: "B",
                explanation: "2 + 2 = 4",
              },
            },
            questionNumber: 1,
            marks: 2,
          },
          {
            questionId: {
              _id: "q2",
              type: "true_false",
              content: {
                text: "The Earth is flat.",
                correctAnswer: "False",
                explanation: "The Earth is roughly spherical.",
              },
            },
            questionNumber: 2,
            marks: 1,
          },
        ],
      },
      {
        name: "Comprehension",
        questions: [
          {
            questionId: {
              _id: "q3",
              type: "comprehension",
              content: {
                text: "Read the passage and answer:",
                passage: "The mitochondria is the powerhouse of the cell.",
                subQuestions: [
                  { text: "What is the powerhouse of the cell?" },
                  { text: "Why is it important?" },
                ],
                correctAnswer: "Mitochondria",
                explanation: "Discussed in the passage.",
              },
            },
            questionNumber: 3,
            marks: 4,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("pdfGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildQuestionPaperHtml", () => {
    it("renders MCQ questions with options A/B/C/D", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("What is 2 + 2?");
      expect(html).toContain("A.");
      expect(html).toContain("B.");
      expect(html).toContain("C.");
      expect(html).toContain("D.");
      expect(html).toContain("3");
      expect(html).toContain("4");
      expect(html).toContain("5");
      expect(html).toContain("6");
      expect(html).toContain("Q1.");
      expect(html).toContain("[2 marks]");
    });

    it("renders true/false questions", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("The Earth is flat.");
      expect(html).toContain("True");
      expect(html).toContain("False");
      expect(html).toContain("[1 mark]");
    });

    it("renders comprehension questions with passage text", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("The mitochondria is the powerhouse of the cell.");
      expect(html).toContain("passage");
      expect(html).toContain("a)");
      expect(html).toContain("What is the powerhouse of the cell?");
      expect(html).toContain("b)");
    });

    it("applies template formatting (font size, margins, paper size)", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("--font-family: Times New Roman");
      expect(html).toContain("--font-size: 14pt");
      expect(html).toContain("--line-spacing: 1.6");
      expect(html).toContain("--paper-size: A4");
      expect(html).toContain("--margin-top: 25mm");
      expect(html).toContain("--margin-right: 20mm");
    });

    it("renders section headers with alpha numbering", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Section A: Multiple Choice");
      expect(html).toContain("Section B: Comprehension");
    });

    it("renders header with title, subtitle, and student info fields", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Test Exam");
      expect(html).toContain("Year 10 Mathematics");
      expect(html).toContain("Name:");
      expect(html).toContain("Date:");
      expect(html).toContain("Class:");
    });

    it("renders instructions block", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Instructions");
      expect(html).toContain("Answer all questions. Show your working.");
    });

    it("renders footer with copyright text", () => {
      const html = buildQuestionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("© 2025 PaperCraft");
      expect(html).toContain("page-number");
    });

    it("renders match_the_column questions", () => {
      const paper = makePaper({
        sections: [
          {
            name: "Matching",
            questions: [
              {
                questionId: {
                  type: "match_the_column",
                  content: {
                    text: "Match Column A with Column B",
                    columnA: ["Dog", "Cat", "Bird"],
                    columnB: ["Barks", "Meows", "Chirps"],
                  },
                },
                questionNumber: 1,
                marks: 3,
              },
            ],
          },
        ],
      });

      const html = buildQuestionPaperHtml({
        paper,
        template: makeTemplate(),
      });

      expect(html).toContain("Column A");
      expect(html).toContain("Column B");
      expect(html).toContain("Dog");
      expect(html).toContain("Barks");
    });
  });

  describe("buildAnswerSheetHtml", () => {
    it("generates bubble grids for MCQ sections", () => {
      const html = buildAnswerSheetHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Answer Sheet");
      expect(html).toContain("bubble-grid");
      expect(html).toContain("bubble");
      // MCQ should have A, B, C, D bubbles
      expect(html).toContain(">A</div>");
      expect(html).toContain(">B</div>");
      expect(html).toContain(">C</div>");
      expect(html).toContain(">D</div>");
    });

    it("generates true/false bubbles with only A and B", () => {
      const paper = makePaper({
        sections: [
          {
            name: "True/False",
            questions: [
              {
                questionId: { type: "true_false", content: { text: "Test" } },
                questionNumber: 1,
                marks: 1,
              },
            ],
          },
        ],
      });

      const html = buildAnswerSheetHtml({
        paper,
        template: makeTemplate(),
      });

      expect(html).toContain("bubble-grid");
      // Should have A and B but not C and D
      const bubbleSection = html.split("bubble-grid")[1].split("</div>").slice(0, 5).join("</div>");
      expect(bubbleSection).toContain(">A</div>");
      expect(bubbleSection).toContain(">B</div>");
    });

    it("generates lined areas for text answer sections", () => {
      const paper = makePaper({
        sections: [
          {
            name: "Long Answers",
            questions: [
              {
                questionId: {
                  type: "long_answer",
                  content: { text: "Explain photosynthesis" },
                },
                questionNumber: 1,
                marks: 5,
              },
            ],
          },
        ],
      });

      const html = buildAnswerSheetHtml({
        paper,
        template: makeTemplate(),
      });

      expect(html).toContain("lined-box");
      expect(html).toContain("large");
      expect(html).toContain("line");
    });

    it("generates short lined areas for short answer questions", () => {
      const paper = makePaper({
        sections: [
          {
            name: "Short Answers",
            questions: [
              {
                questionId: {
                  type: "short_answer",
                  content: { text: "Define gravity" },
                },
                questionNumber: 1,
                marks: 2,
              },
            ],
          },
        ],
      });

      const html = buildAnswerSheetHtml({
        paper,
        template: makeTemplate(),
      });

      expect(html).toContain("lined-box");
      // Short answer gets 3 lines, not 6
      const lineMatches = html.match(/<div class="line"><\/div>/g) || [];
      expect(lineMatches.length).toBe(3);
    });
  });

  describe("buildSolutionPaperHtml", () => {
    it("includes correct answers and explanations", () => {
      const html = buildSolutionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Solution Paper");
      expect(html).toContain("solution-item");
      expect(html).toContain("correct-answer");
      expect(html).toContain("Answer: B");
      expect(html).toContain("2 + 2 = 4");
      expect(html).toContain("Answer: False");
      expect(html).toContain("The Earth is roughly spherical.");
    });

    it("includes marks per question", () => {
      const html = buildSolutionPaperHtml({
        paper: makePaper(),
        template: makeTemplate(),
      });

      expect(html).toContain("Marks: 2");
      expect(html).toContain("Marks: 1");
      expect(html).toContain("Marks: 4");
    });

    it("truncates long question text to 100 characters", () => {
      const longText = "A".repeat(150);
      const paper = makePaper({
        sections: [
          {
            name: "Test",
            questions: [
              {
                questionId: {
                  type: "mcq",
                  content: { text: longText, correctAnswer: "A" },
                },
                questionNumber: 1,
                marks: 1,
              },
            ],
          },
        ],
      });

      const html = buildSolutionPaperHtml({
        paper,
        template: makeTemplate(),
      });

      expect(html).toContain("...");
      // Should only have first 100 chars of the text
      expect(html).toContain("A".repeat(100));
    });
  });

  describe("applyWatermark", () => {
    it("injects watermark overlay before </body>", () => {
      const baseHtml = "<html><body><p>Content</p></body></html>";
      const result = applyWatermark(baseHtml, "DRAFT COPY");

      expect(result).toContain("watermark-overlay");
      expect(result).toContain("DRAFT COPY");
      expect(result).toContain("</body>");
      // Watermark should appear before </body>
      const wmIdx = result.indexOf("watermark-overlay");
      const bodyIdx = result.indexOf("</body>");
      expect(wmIdx).toBeLessThan(bodyIdx);
    });

    it("returns unchanged HTML when watermark text is empty", () => {
      const baseHtml = "<html><body><p>Content</p></body></html>";
      const result = applyWatermark(baseHtml, "");

      expect(result).toBe(baseHtml);
    });
  });

  describe("applyBranding", () => {
    it("injects brand color CSS rule before </style>", () => {
      const baseHtml = "<html><head><style>body{}</style></head><body></body></html>";
      const result = applyBranding(baseHtml, { primaryColor: "#FF5500" });

      expect(result).toContain(".paper-header .title { color: #FF5500; }");
      expect(result).toContain("</style>");
    });

    it("returns unchanged HTML when no branding provided", () => {
      const baseHtml = "<html><head><style>body{}</style></head><body></body></html>";
      const result = applyBranding(baseHtml, undefined);

      expect(result).toBe(baseHtml);
    });

    it("returns unchanged HTML when no primaryColor", () => {
      const baseHtml = "<html><head><style>body{}</style></head><body></body></html>";
      const result = applyBranding(baseHtml, { logoUrl: "https://example.com/logo.png" });

      // No color rule should be added since no primaryColor
      expect(result).toBe(baseHtml);
    });
  });
});
