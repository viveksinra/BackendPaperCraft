import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const topicDistributionSchema = z.object({
  topicId:    z.string().regex(objectIdRegex, "Invalid ObjectId"),
  percentage: z.number().min(0).max(100),
});

const difficultyMixSchema = z.object({
  easy:   z.number().min(0).max(100).default(25),
  medium: z.number().min(0).max(100).default(50),
  hard:   z.number().min(0).max(100).default(20),
  expert: z.number().min(0).max(100).default(5),
}).refine(
  (mix) => mix.easy + mix.medium + mix.hard + mix.expert === 100,
  { message: "Difficulty mix percentages must sum to 100" }
);

const blueprintSectionSchema = z.object({
  name:              z.string().min(1).max(200),
  questionCount:     z.number().int().min(1).max(200),
  questionTypes:     z.array(z.string()).min(1),
  marksPerQuestion:  z.number().min(0).max(100).default(1),
  mixedMarks:        z.boolean().default(false),
  timeLimit:         z.number().int().min(0).max(300).default(0),
  topicDistribution: z.array(topicDistributionSchema).default([]).refine(
    (arr) => arr.length === 0 || arr.reduce((sum, t) => sum + t.percentage, 0) === 100,
    { message: "Topic distribution percentages must sum to 100 when provided" }
  ),
  difficultyMix: difficultyMixSchema.default({ easy: 25, medium: 50, hard: 20, expert: 5 }),
  instructions:  z.string().max(5000).default(""),
  subjectId:     z.string().regex(objectIdRegex).optional(),
});

const constraintsSchema = z.object({
  excludeRecentlyUsed: z.boolean().default(true),
  recentlyUsedWindow:  z.number().int().min(1).max(365).default(30),
  excludeQuestionIds:  z.array(z.string().regex(objectIdRegex)).default([]),
  requireApprovedOnly: z.boolean().default(true),
});

export const createPaperBlueprintSchema = z.object({
  name:        z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  totalMarks:  z.number().int().min(1).max(10000),
  totalTime:   z.number().int().min(1).max(600),
  sections:    z.array(blueprintSectionSchema).min(1).max(20),
  constraints: constraintsSchema.optional(),
});

export const updatePaperBlueprintSchema = z.object({
  name:        z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  totalMarks:  z.number().int().min(1).max(10000).optional(),
  totalTime:   z.number().int().min(1).max(600).optional(),
  sections:    z.array(blueprintSectionSchema).min(1).max(20).optional(),
  constraints: constraintsSchema.partial().optional(),
});
