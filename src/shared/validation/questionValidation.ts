import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, "Invalid ObjectId");

const QUESTION_TYPES = [
  "mcq_single", "mcq_multiple", "true_false", "fill_in_blank",
  "short_answer", "long_answer", "comprehension", "match_the_column",
  "assertion_reasoning", "numerical", "math_latex", "diagram_image",
  "verbal_reasoning", "non_verbal_reasoning", "english_comprehension",
  "creative_writing", "cloze_passage", "synonym_antonym",
  "missing_letters", "word_definition",
] as const;

const DIFFICULTY_LEVELS = ["easy", "medium", "hard", "very_hard"] as const;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const optionSchema = z.object({
  label: z.string().default(""),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean().default(false),
  explanation: z.string().optional(),
  imageUrl: z.string().optional(),
});

const imageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
  caption: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const matchPairSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1),
});

const subQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  type: z.enum(QUESTION_TYPES),
  body: z.string().min(1),
  options: z.array(optionSchema).optional(),
  correctAnswer: z.string().optional(),
  marks: z.number().min(0),
  explanation: z.string().optional(),
});

const contentSchema = z.object({
  body: z.string().min(1, "Question body is required"),
  bodyHtml: z.string().optional(),
  options: z.array(optionSchema).optional(),
  correctAnswer: z.string().optional(),
  correctAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  solution: z.string().optional(),
  solutionHtml: z.string().optional(),
  passage: z.string().optional(),
  passageHtml: z.string().optional(),
  matchPairs: z.array(matchPairSchema).optional(),
  assertion: z.string().optional(),
  reason: z.string().optional(),
  subQuestions: z.array(subQuestionSchema).optional(),
  images: z.array(imageSchema).optional(),
  hints: z.array(z.string()).optional(),
  numericalAnswer: z.number().optional(),
  numericalTolerance: z.number().min(0).optional(),
  numericalUnit: z.string().optional(),
  wordList: z.array(z.string()).optional(),
  blanks: z.array(z.string()).optional(),
});

const metadataSchema = z.object({
  subjectId: objectId.optional(),
  chapterId: objectId.optional(),
  topicId: objectId.optional(),
  subtopicId: objectId.optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).default("medium"),
  marks: z.number().min(0).max(100).default(1),
  negativeMarks: z.number().min(0).max(100).default(0),
  expectedTime: z.number().int().min(0).max(3600).default(60),
  examTypes: z.array(z.string().trim()).default([]),
  tags: z.array(z.string().trim().toLowerCase()).default([]),
  language: z.string().default("en"),
  source: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
});

// ─── Create Question ──────────────────────────────────────────────────────────

export const createQuestionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    content: contentSchema,
    metadata: metadataSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const { type, content } = data;

    // MCQ types require options with at least one correct
    if (type === "mcq_single" || type === "mcq_multiple") {
      if (!content.options || content.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ questions require at least 2 options",
          path: ["content", "options"],
        });
      }
      const correctCount = content.options?.filter((o) => o.isCorrect).length ?? 0;
      if (type === "mcq_single" && correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ single must have exactly 1 correct option",
          path: ["content", "options"],
        });
      }
      if (type === "mcq_multiple" && correctCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MCQ multiple must have at least 1 correct option",
          path: ["content", "options"],
        });
      }
    }

    // True/false requires correctAnswer
    if (type === "true_false" && !content.correctAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "True/False questions require a correctAnswer ('true' or 'false')",
        path: ["content", "correctAnswer"],
      });
    }

    // Comprehension requires passage and sub-questions
    if (type === "comprehension" || type === "english_comprehension") {
      if (!content.passage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Comprehension questions require a passage",
          path: ["content", "passage"],
        });
      }
      if (!content.subQuestions || content.subQuestions.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Comprehension questions require at least 1 sub-question",
          path: ["content", "subQuestions"],
        });
      }
    }

    // Match the column requires matchPairs
    if (type === "match_the_column") {
      if (!content.matchPairs || content.matchPairs.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Match questions require at least 2 pairs",
          path: ["content", "matchPairs"],
        });
      }
    }

    // Assertion-reasoning requires assertion and reason
    if (type === "assertion_reasoning") {
      if (!content.assertion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Assertion-reasoning requires an assertion",
          path: ["content", "assertion"],
        });
      }
      if (!content.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Assertion-reasoning requires a reason",
          path: ["content", "reason"],
        });
      }
    }

    // Numerical requires numericalAnswer
    if (type === "numerical" && content.numericalAnswer === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Numerical questions require a numericalAnswer",
        path: ["content", "numericalAnswer"],
      });
    }

    // Fill in blank requires correctAnswer or blanks
    if (type === "fill_in_blank") {
      if (!content.correctAnswer && (!content.blanks || content.blanks.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fill-in-blank requires correctAnswer or blanks",
          path: ["content", "correctAnswer"],
        });
      }
    }

    // Cloze passage requires passage and blanks
    if (type === "cloze_passage") {
      if (!content.passage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cloze passage requires a passage",
          path: ["content", "passage"],
        });
      }
      if (!content.blanks || content.blanks.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cloze passage requires at least 1 blank",
          path: ["content", "blanks"],
        });
      }
    }

    // Synonym/antonym requires wordList or correctAnswer
    if (type === "synonym_antonym" && !content.correctAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Synonym/Antonym questions require a correctAnswer",
        path: ["content", "correctAnswer"],
      });
    }
  });

// ─── Update Question ──────────────────────────────────────────────────────────

export const updateQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES).optional(),
  content: contentSchema.partial().optional(),
  metadata: metadataSchema.partial().optional(),
  version: z.number().int().min(1).optional(),
});

// ─── List Questions Query ─────────────────────────────────────────────────────

export const listQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "metadata.marks", "metadata.difficulty", "type"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().max(200).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  subjectId: objectId.optional(),
  chapterId: objectId.optional(),
  topicId: objectId.optional(),
  status: z.enum(["draft", "pending_review", "approved", "rejected"]).optional(),
  archived: z.coerce.boolean().optional(),
  tags: z.string().optional(),
  examType: z.string().optional(),
});

// ─── Review Action ────────────────────────────────────────────────────────────

export const reviewActionSchema = z.object({
  action: z.enum(["submit", "approve", "reject"]),
  notes: z.string().max(2000).optional(),
});
