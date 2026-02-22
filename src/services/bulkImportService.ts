import mongoose from "mongoose";
import { BulkImportJobModel, BulkImportJobDocument, ParsedQuestion } from "../models/bulkImportJob";
import { QuestionModel } from "../models/question";
import { incrementQuestionCount } from "./subjectService";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Initiate Import ────────────────────────────────────────────────────────

export async function initiateImport(
  companyId: string,
  tenantId: string,
  source: "csv" | "docx" | "paste",
  fileKey: string | undefined,
  fileName: string,
  userEmail: string
): Promise<BulkImportJobDocument> {
  const job = await BulkImportJobModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    source,
    fileName,
    fileKey,
    status: "uploaded",
    totalRows: 0,
    parsedCount: 0,
    importedCount: 0,
    errorCount: 0,
    parsedPreview: [],
    subjectMapping: {},
    defaultMetadata: {},
    errors: [],
    createdBy: userEmail,
  });

  return job;
}

// ─── Parse Uploaded File ────────────────────────────────────────────────────

export async function parseUploadedFile(
  jobId: string,
  fileContent: Buffer | string
): Promise<BulkImportJobDocument> {
  const job = await BulkImportJobModel.findById(toObjectId(jobId));
  if (!job) {
    throw Object.assign(new Error("Import job not found"), { status: 404 });
  }

  job.status = "parsing";
  await job.save();

  try {
    let parsed: ParsedQuestion[];

    if (job.source === "csv") {
      parsed = parseCsv(typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8"));
    } else if (job.source === "docx") {
      parsed = parseDocxText(typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8"));
    } else {
      // paste
      parsed = parseCsv(typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8"));
    }

    job.parsedPreview = parsed;
    job.totalRows = parsed.length;
    job.parsedCount = parsed.filter((p) => p.isValid).length;
    job.errorCount = parsed.filter((p) => !p.isValid).length;
    job.status = "parsed";
    await job.save();
    return job;
  } catch (err: any) {
    job.status = "failed";
    job.errors.push({ row: 0, message: err.message || "Parse failed" });
    await job.save();
    throw err;
  }
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────

function parseCsv(text: string): ParsedQuestion[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim().replace(/"/g, ""));

  const bodyIdx = headers.findIndex((h) => ["question", "body", "text", "question_text"].includes(h));
  const typeIdx = headers.findIndex((h) => ["type", "question_type"].includes(h));
  const optAIdx = headers.findIndex((h) => ["option_a", "a", "opt_a"].includes(h));
  const optBIdx = headers.findIndex((h) => ["option_b", "b", "opt_b"].includes(h));
  const optCIdx = headers.findIndex((h) => ["option_c", "c", "opt_c"].includes(h));
  const optDIdx = headers.findIndex((h) => ["option_d", "d", "opt_d"].includes(h));
  const answerIdx = headers.findIndex((h) => ["answer", "correct_answer", "correct"].includes(h));
  const explanationIdx = headers.findIndex((h) => ["explanation", "solution"].includes(h));
  const difficultyIdx = headers.findIndex((h) => ["difficulty", "level"].includes(h));
  const marksIdx = headers.findIndex((h) => ["marks", "score", "points"].includes(h));
  const tagsIdx = headers.findIndex((h) => ["tags", "tag"].includes(h));

  const parsed: ParsedQuestion[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: ParsedQuestion = {
      rowIndex: i,
      type: typeIdx >= 0 ? (cols[typeIdx] || "mcq_single").trim() : "mcq_single",
      body: bodyIdx >= 0 ? (cols[bodyIdx] || "").trim() : "",
      options: [],
      correctAnswer: answerIdx >= 0 ? (cols[answerIdx] || "").trim() : undefined,
      explanation: explanationIdx >= 0 ? (cols[explanationIdx] || "").trim() : undefined,
      difficulty: difficultyIdx >= 0 ? (cols[difficultyIdx] || "").trim() : undefined,
      marks: marksIdx >= 0 ? parseFloat(cols[marksIdx]) || undefined : undefined,
      tags: tagsIdx >= 0 ? (cols[tagsIdx] || "").split(";").map((t) => t.trim()).filter(Boolean) : [],
      isValid: true,
    };

    // Build options from columns
    const optionLabels = ["A", "B", "C", "D"];
    const optionIdxs = [optAIdx, optBIdx, optCIdx, optDIdx];
    for (let j = 0; j < optionIdxs.length; j++) {
      if (optionIdxs[j] >= 0 && cols[optionIdxs[j]]?.trim()) {
        row.options!.push({
          text: cols[optionIdxs[j]].trim(),
          isCorrect: row.correctAnswer?.toUpperCase() === optionLabels[j],
        });
      }
    }

    // Validate
    if (!row.body) {
      row.isValid = false;
      row.error = "Missing question body";
    }

    parsed.push(row);
  }

  return parsed;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── DOCX Text Parser ──────────────────────────────────────────────────────

function parseDocxText(text: string): ParsedQuestion[] {
  // Simple pattern-based detection for questions from extracted text
  const parsed: ParsedQuestion[] = [];
  const questionBlocks = text.split(/\n(?=\d+[\.\)]\s)/).filter((b) => b.trim());

  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i].trim();
    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l);

    if (lines.length === 0) continue;

    // First line is the question body (strip number prefix)
    const bodyLine = lines[0].replace(/^\d+[\.\)]\s*/, "").trim();

    const options: { text: string; isCorrect: boolean }[] = [];
    let correctAnswer: string | undefined;
    let explanation: string | undefined;

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      // Match option patterns: A) text, (A) text, a. text
      const optMatch = line.match(/^[\(\[]?([A-Da-d])[\)\]\.]\s*(.*)/);
      if (optMatch) {
        options.push({ text: optMatch[2].trim(), isCorrect: false });
        continue;
      }
      // Match answer patterns
      const ansMatch = line.match(/^(?:Answer|Ans|Correct)[:\s]*([A-Da-d])/i);
      if (ansMatch) {
        correctAnswer = ansMatch[1].toUpperCase();
        continue;
      }
      // Match explanation
      const expMatch = line.match(/^(?:Explanation|Solution)[:\s]*(.*)/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
      }
    }

    // Mark correct option
    if (correctAnswer && options.length > 0) {
      const idx = correctAnswer.charCodeAt(0) - "A".charCodeAt(0);
      if (idx >= 0 && idx < options.length) {
        options[idx].isCorrect = true;
      }
    }

    parsed.push({
      rowIndex: i,
      type: options.length > 0 ? "mcq_single" : "short_answer",
      body: bodyLine,
      options: options.length > 0 ? options : undefined,
      correctAnswer,
      explanation,
      isValid: !!bodyLine,
      error: bodyLine ? undefined : "Missing question body",
    });
  }

  return parsed;
}

// ─── Confirm Import ─────────────────────────────────────────────────────────

export async function confirmImport(
  jobId: string,
  userModifications: ParsedQuestion[] | undefined,
  subjectMapping: Record<string, string> | undefined,
  defaultMetadata: Record<string, unknown> | undefined
): Promise<BulkImportJobDocument> {
  const job = await BulkImportJobModel.findById(toObjectId(jobId));
  if (!job) {
    throw Object.assign(new Error("Import job not found"), { status: 404 });
  }
  if (job.status !== "parsed") {
    throw Object.assign(new Error("Job must be in parsed status to confirm"), { status: 400 });
  }

  job.status = "importing";
  if (subjectMapping) {
    if (subjectMapping.subjectId) job.subjectMapping.subjectId = toObjectId(subjectMapping.subjectId);
    if (subjectMapping.chapterId) job.subjectMapping.chapterId = toObjectId(subjectMapping.chapterId);
    if (subjectMapping.topicId) job.subjectMapping.topicId = toObjectId(subjectMapping.topicId);
  }
  if (defaultMetadata) {
    job.defaultMetadata = {
      difficulty: (defaultMetadata.difficulty as string) || undefined,
      marks: (defaultMetadata.marks as number) || undefined,
      examTypes: (defaultMetadata.examTypes as string[]) || [],
      tags: (defaultMetadata.tags as string[]) || [],
    };
  }
  await job.save();

  const questions = userModifications || job.parsedPreview;
  let importedCount = 0;
  const errors: { row: number; message: string }[] = [];

  for (const q of questions) {
    if (!q.isValid) {
      errors.push({ row: q.rowIndex, message: q.error || "Invalid question" });
      continue;
    }

    try {
      const metadata: Record<string, unknown> = {
        difficulty: q.difficulty || job.defaultMetadata.difficulty || "medium",
        marks: q.marks || job.defaultMetadata.marks || 1,
        negativeMarks: 0,
        expectedTime: 60,
        examTypes: job.defaultMetadata.examTypes || [],
        tags: [...(q.tags || []), ...(job.defaultMetadata.tags || [])],
        language: "en",
      };

      if (job.subjectMapping.subjectId) metadata.subjectId = job.subjectMapping.subjectId;
      if (job.subjectMapping.chapterId) metadata.chapterId = job.subjectMapping.chapterId;
      if (job.subjectMapping.topicId) metadata.topicId = job.subjectMapping.topicId;

      const content: Record<string, unknown> = {
        body: q.body,
        explanation: q.explanation,
      };

      if (q.options && q.options.length > 0) {
        content.options = q.options.map((o, idx) => ({
          label: String.fromCharCode(65 + idx),
          text: o.text,
          isCorrect: o.isCorrect,
        }));
      }

      if (q.correctAnswer) {
        content.correctAnswer = q.correctAnswer;
      }

      await QuestionModel.create({
        tenantId: job.tenantId,
        companyId: job.companyId,
        type: q.type || "mcq_single",
        content,
        metadata,
        usage: { paperCount: 0, testCount: 0, homeworkCount: 0, history: [] },
        review: { status: "draft" },
        performance: {
          totalAttempts: 0, correctAttempts: 0, avgScore: 0,
          avgTimeSpent: 0, discriminationIndex: 0, difficultyIndex: 0,
        },
        isArchived: false,
        version: 1,
        createdBy: job.createdBy,
        updatedBy: job.createdBy,
      });

      importedCount++;

      // Increment subject count
      if (job.subjectMapping.subjectId) {
        await incrementQuestionCount(job.subjectMapping.subjectId.toString(), 1);
      }
    } catch (err: any) {
      errors.push({ row: q.rowIndex, message: err.message || "Failed to create question" });
    }
  }

  job.importedCount = importedCount;
  job.errorCount = errors.length;
  job.errors = errors;
  job.status = errors.length > 0 && importedCount === 0 ? "failed" : "completed";
  job.completedAt = new Date();
  await job.save();

  return job;
}

// ─── Get Import Job Status ──────────────────────────────────────────────────

export async function getImportJobStatus(
  companyId: string,
  jobId: string
): Promise<BulkImportJobDocument> {
  const job = await BulkImportJobModel.findOne({
    _id: toObjectId(jobId),
    companyId: toObjectId(companyId),
  });
  if (!job) {
    throw Object.assign(new Error("Import job not found"), { status: 404 });
  }
  return job;
}
