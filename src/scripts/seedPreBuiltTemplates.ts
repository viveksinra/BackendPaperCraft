/**
 * Seed script for pre-built Paper Templates and Paper Blueprints.
 *
 * Idempotent: skips items that already exist (matched by name + isPreBuilt).
 * Run with: npx ts-node src/scripts/seedPreBuiltTemplates.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { PaperTemplateModel } from "../models/paperTemplate";
import { PaperBlueprintModel } from "../models/paperBlueprint";

const PLATFORM_COMPANY_ID = new mongoose.Types.ObjectId("000000000000000000000001");
const PLATFORM_TENANT_ID = "platform";
const SYSTEM_EMAIL = "system@papercraft.app";

// ─── Templates ───────────────────────────────────────────────────────────────

const templates = [
  {
    name: "FSCE Mock Test Template",
    description: "Official FSCE (Familiarisation, Schools, Consortiums Examinations) mock test format with A4, 12pt Arial, student info header.",
    layout: {
      header: { showLogo: true, logoPosition: "left" as const, title: "FSCE Mock Test", subtitle: "", studentInfoFields: ["Name", "Date", "School", "Candidate No."] },
      instructions: { show: true, text: "Read each question carefully. Write your answers in the spaces provided. Show all working where required.", position: "before_sections" as const },
      sections: { numberingStyle: "numeric" as const, showSectionHeaders: true, pageBreakBetweenSections: true },
      footer: { showPageNumbers: true, copyrightText: "PaperCraft Platform", showWatermark: true, watermarkText: "SAMPLE" },
      formatting: { paperSize: "A4" as const, margins: { top: 20, right: 15, bottom: 20, left: 15 }, fontSize: 12, fontFamily: "Arial", lineSpacing: 1.5 },
    },
  },
  {
    name: "CSSE Mock Test Template",
    description: "CSSE (Consortium of Selective Schools in Essex) format with A4, 11pt Times New Roman, lettered sections.",
    layout: {
      header: { showLogo: true, logoPosition: "left" as const, title: "CSSE Mock Test", subtitle: "", studentInfoFields: ["Name", "Date", "School"] },
      instructions: { show: true, text: "Answer ALL questions. Time allowed is indicated for each section.", position: "before_sections" as const },
      sections: { numberingStyle: "alpha" as const, showSectionHeaders: true, pageBreakBetweenSections: true },
      footer: { showPageNumbers: true, copyrightText: "PaperCraft Platform", showWatermark: false, watermarkText: "" },
      formatting: { paperSize: "A4" as const, margins: { top: 20, right: 15, bottom: 20, left: 15 }, fontSize: 11, fontFamily: "Times New Roman", lineSpacing: 1.4 },
    },
  },
  {
    name: "Generic 11+ Practice Template",
    description: "Standard 11+ practice paper format with numbered sections, no page breaks.",
    layout: {
      header: { showLogo: false, logoPosition: "left" as const, title: "11+ Practice Paper", subtitle: "", studentInfoFields: ["Name", "Date"] },
      instructions: { show: true, text: "Answer all questions. You may use a pencil.", position: "before_sections" as const },
      sections: { numberingStyle: "numeric" as const, showSectionHeaders: true, pageBreakBetweenSections: false },
      footer: { showPageNumbers: true, copyrightText: "", showWatermark: false, watermarkText: "" },
      formatting: { paperSize: "A4" as const, margins: { top: 20, right: 15, bottom: 20, left: 15 }, fontSize: 12, fontFamily: "Arial", lineSpacing: 1.5 },
    },
  },
  {
    name: "Weekly Quiz Template",
    description: "Compact single-section quiz format with tight margins for weekly assessment.",
    layout: {
      header: { showLogo: false, logoPosition: "left" as const, title: "Weekly Quiz", subtitle: "", studentInfoFields: ["Name", "Date"] },
      instructions: { show: false, text: "", position: "before_sections" as const },
      sections: { numberingStyle: "numeric" as const, showSectionHeaders: false, pageBreakBetweenSections: false },
      footer: { showPageNumbers: false, copyrightText: "", showWatermark: false, watermarkText: "" },
      formatting: { paperSize: "A4" as const, margins: { top: 10, right: 10, bottom: 10, left: 10 }, fontSize: 11, fontFamily: "Arial", lineSpacing: 1.3 },
    },
  },
  {
    name: "Chapter Test Template",
    description: "Single-section chapter test with 'End of Test' marker.",
    layout: {
      header: { showLogo: false, logoPosition: "left" as const, title: "Chapter Test", subtitle: "", studentInfoFields: ["Name", "Date", "Class"] },
      instructions: { show: true, text: "Answer all questions. Show your working.", position: "before_sections" as const },
      sections: { numberingStyle: "numeric" as const, showSectionHeaders: false, pageBreakBetweenSections: false },
      footer: { showPageNumbers: true, copyrightText: "--- End of Test ---", showWatermark: false, watermarkText: "" },
      formatting: { paperSize: "A4" as const, margins: { top: 20, right: 15, bottom: 20, left: 15 }, fontSize: 12, fontFamily: "Arial", lineSpacing: 1.5 },
    },
  },
];

// ─── Blueprints ──────────────────────────────────────────────────────────────

const defaultDifficultyMix = { easy: 25, medium: 50, hard: 20, expert: 5 };

const blueprints = [
  {
    name: "FSCE Mock Test -- Paper 1",
    description: "FSCE Paper 1: English, Maths, Verbal Reasoning. 85 marks, 45 minutes.",
    totalMarks: 85,
    totalTime: 45,
    sections: [
      { name: "English", questionCount: 25, questionTypes: ["mcq", "short_answer"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "Mathematics", questionCount: 30, questionTypes: ["mcq", "short_answer"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "Verbal Reasoning", questionCount: 30, questionTypes: ["mcq"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "FSCE Mock Test -- Paper 2",
    description: "FSCE Paper 2: English Comprehension, Maths Problem Solving, Non-Verbal Reasoning. 80 marks, 35 minutes.",
    totalMarks: 80,
    totalTime: 35,
    sections: [
      { name: "English Comprehension", questionCount: 20, questionTypes: ["comprehension", "short_answer"], marksPerQuestion: 1, mixedMarks: true, timeLimit: 12, topicDistribution: [], difficultyMix: { easy: 20, medium: 50, hard: 25, expert: 5 }, instructions: "", subjectId: null },
      { name: "Maths Problem Solving", questionCount: 25, questionTypes: ["short_answer", "mcq"], marksPerQuestion: 1, mixedMarks: true, timeLimit: 12, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "Non-Verbal Reasoning", questionCount: 35, questionTypes: ["mcq"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 11, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "FSCE Mock Test -- Paper 3",
    description: "FSCE Paper 3: Creative Writing. 20 marks, 20 minutes.",
    totalMarks: 20,
    totalTime: 20,
    sections: [
      { name: "Creative Writing", questionCount: 1, questionTypes: ["long_answer"], marksPerQuestion: 20, mixedMarks: false, timeLimit: 20, topicDistribution: [], difficultyMix: { easy: 0, medium: 50, hard: 40, expert: 10 }, instructions: "Write a story or essay on the given topic.", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 60, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "CSSE Mock Test -- English",
    description: "CSSE English paper: Comprehension and Writing. 60 marks, 60 minutes.",
    totalMarks: 60,
    totalTime: 60,
    sections: [
      { name: "Comprehension", questionCount: 20, questionTypes: ["comprehension", "short_answer"], marksPerQuestion: 2, mixedMarks: true, timeLimit: 30, topicDistribution: [], difficultyMix: { easy: 20, medium: 45, hard: 25, expert: 10 }, instructions: "Read the passage and answer the questions.", subjectId: null },
      { name: "Writing", questionCount: 2, questionTypes: ["long_answer"], marksPerQuestion: 10, mixedMarks: false, timeLimit: 30, topicDistribution: [], difficultyMix: { easy: 0, medium: 50, hard: 40, expert: 10 }, instructions: "Write a response for each prompt.", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "CSSE Mock Test -- Maths",
    description: "CSSE Mathematics paper. 80 marks, 60 minutes.",
    totalMarks: 80,
    totalTime: 60,
    sections: [
      { name: "Section A -- Short Questions", questionCount: 40, questionTypes: ["mcq", "short_answer"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 30, topicDistribution: [], difficultyMix: { easy: 30, medium: 50, hard: 15, expert: 5 }, instructions: "", subjectId: null },
      { name: "Section B -- Problem Solving", questionCount: 10, questionTypes: ["short_answer", "long_answer"], marksPerQuestion: 4, mixedMarks: true, timeLimit: 30, topicDistribution: [], difficultyMix: { easy: 10, medium: 40, hard: 35, expert: 15 }, instructions: "Show all working.", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "Generic 11+ Practice",
    description: "Mixed 11+ practice: VR, NVR, English, Maths. 100 marks, 60 minutes.",
    totalMarks: 100,
    totalTime: 60,
    sections: [
      { name: "Verbal Reasoning", questionCount: 25, questionTypes: ["mcq"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "Non-Verbal Reasoning", questionCount: 25, questionTypes: ["mcq"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "English", questionCount: 25, questionTypes: ["mcq", "short_answer"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
      { name: "Mathematics", questionCount: 25, questionTypes: ["mcq", "short_answer"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 15, topicDistribution: [], difficultyMix: defaultDifficultyMix, instructions: "", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "Weekly Quiz",
    description: "Quick weekly quiz. 20 marks, 20 minutes, single section mixed questions.",
    totalMarks: 20,
    totalTime: 20,
    sections: [
      { name: "Quiz", questionCount: 20, questionTypes: ["mcq", "true_false", "fill_blank"], marksPerQuestion: 1, mixedMarks: false, timeLimit: 20, topicDistribution: [], difficultyMix: { easy: 40, medium: 40, hard: 15, expert: 5 }, instructions: "", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 7, excludeQuestionIds: [], requireApprovedOnly: true },
  },
  {
    name: "Chapter Test",
    description: "End-of-chapter test. 50 marks, 45 minutes, single section mixed questions.",
    totalMarks: 50,
    totalTime: 45,
    sections: [
      { name: "Test", questionCount: 30, questionTypes: ["mcq", "short_answer", "long_answer"], marksPerQuestion: 1, mixedMarks: true, timeLimit: 45, topicDistribution: [], difficultyMix: { easy: 20, medium: 50, hard: 25, expert: 5 }, instructions: "Answer all questions.", subjectId: null },
    ],
    constraints: { excludeRecentlyUsed: true, recentlyUsedWindow: 30, excludeQuestionIds: [], requireApprovedOnly: true },
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DEVELOPMENT_URI || process.env.MONGO_URI || "mongodb://localhost:27017/papercraft";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  let templatesCreated = 0;
  let templatesSkipped = 0;

  for (const tmpl of templates) {
    const exists = await PaperTemplateModel.findOne({ name: tmpl.name, isPreBuilt: true });
    if (exists) {
      console.log(`  SKIP template: ${tmpl.name}`);
      templatesSkipped++;
      continue;
    }
    await PaperTemplateModel.create({
      tenantId: PLATFORM_TENANT_ID,
      companyId: PLATFORM_COMPANY_ID,
      ...tmpl,
      isPreBuilt: true,
      isActive: true,
      createdBy: SYSTEM_EMAIL,
      updatedBy: SYSTEM_EMAIL,
    });
    console.log(`  CREATE template: ${tmpl.name}`);
    templatesCreated++;
  }

  let blueprintsCreated = 0;
  let blueprintsSkipped = 0;

  for (const bp of blueprints) {
    const exists = await PaperBlueprintModel.findOne({ name: bp.name, isPreBuilt: true });
    if (exists) {
      console.log(`  SKIP blueprint: ${bp.name}`);
      blueprintsSkipped++;
      continue;
    }
    await PaperBlueprintModel.create({
      tenantId: PLATFORM_TENANT_ID,
      companyId: PLATFORM_COMPANY_ID,
      ...bp,
      isPreBuilt: true,
      isActive: true,
      createdBy: SYSTEM_EMAIL,
      updatedBy: SYSTEM_EMAIL,
    });
    console.log(`  CREATE blueprint: ${bp.name}`);
    blueprintsCreated++;
  }

  console.log(`\nDone. Templates: ${templatesCreated} created, ${templatesSkipped} skipped.`);
  console.log(`Blueprints: ${blueprintsCreated} created, ${blueprintsSkipped} skipped.`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
