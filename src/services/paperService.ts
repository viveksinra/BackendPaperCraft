import mongoose from "mongoose";
import { PaperModel, PaperDocument, PaperStatus, PdfType } from "../models/paper";
import { PaperTemplateModel } from "../models/paperTemplate";
import { QuestionModel } from "../models/question";
import { deleteS3Object, getPresignedDownloadUrl } from "../utils/s3";
import { addPdfGenerationJob } from "../queue/queues";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

function recalculateTotals(paper: PaperDocument): void {
  let totalMarks = 0;
  let totalTime = 0;
  for (const section of paper.sections) {
    totalTime += section.timeLimit || 0;
    for (const q of section.questions) {
      totalMarks += q.marks || 0;
    }
  }
  paper.totalMarks = totalMarks;
  paper.totalTime = totalTime;
}

function requireDraft(paper: PaperDocument): void {
  if (paper.status !== "draft") {
    throw Object.assign(
      new Error("Paper must be in draft status for this operation"),
      { status: 400 }
    );
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPaper(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperDocument> {
  // Validate template exists
  const template = await PaperTemplateModel.findOne({
    _id: toObjectId(input.templateId as string),
    isActive: true,
    $or: [{ companyId: toObjectId(companyId) }, { isPreBuilt: true }],
  });
  if (!template) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }

  const doc = await PaperModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    title: input.title,
    description: input.description || "",
    templateId: toObjectId(input.templateId as string),
    blueprintId: null,
    sections: input.sections || [],
    totalMarks: 0,
    totalTime: 0,
    status: "draft",
    pdfs: [],
    version: 1,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  recalculateTotals(doc);
  await doc.save();
  return doc;
}

// ─── List ────────────────────────────────────────────────────────────────────

interface ListFilters {
  status?: PaperStatus;
  search?: string;
  templateId?: string;
  blueprintId?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listPapers(
  companyId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ papers: PaperDocument[]; total: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  if (filters?.status) query.status = filters.status;
  if (filters?.templateId) query.templateId = toObjectId(filters.templateId);
  if (filters?.blueprintId) query.blueprintId = toObjectId(filters.blueprintId);
  if (filters?.search) {
    query.title = { $regex: filters.search, $options: "i" };
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortBy = pagination?.sortBy ?? "createdAt";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [papers, total] = await Promise.all([
    PaperModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("templateId", "name"),
    PaperModel.countDocuments(query),
  ]);

  return { papers, total };
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getPaperById(
  companyId: string,
  paperId: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  })
    .populate("templateId", "name layout")
    .populate("sections.questions.questionId", "type content metadata");

  if (!doc) {
    throw Object.assign(new Error("Paper not found"), { status: 404 });
  }
  return doc;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updatePaper(
  companyId: string,
  paperId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Paper not found"), { status: 404 });
  }

  requireDraft(doc);

  // Optimistic concurrency check
  if (input.version !== undefined && input.version !== doc.version) {
    throw Object.assign(
      new Error("Paper has been modified by another user. Please refresh and try again."),
      { status: 409 }
    );
  }

  if (input.title !== undefined) doc.title = input.title as string;
  if (input.description !== undefined) doc.description = input.description as string;
  if (input.templateId !== undefined) doc.templateId = toObjectId(input.templateId as string);
  if (input.sections !== undefined) doc.sections = input.sections as typeof doc.sections;
  if (input.totalTime !== undefined) doc.totalTime = input.totalTime as number;
  doc.updatedBy = userEmail;

  recalculateTotals(doc);
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deletePaper(
  companyId: string,
  paperId: string
): Promise<void> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Paper not found"), { status: 404 });
  }

  if (doc.status === "finalized" || doc.status === "published") {
    throw Object.assign(
      new Error("Cannot delete a finalized or published paper. Unfinalize it first."),
      { status: 400 }
    );
  }

  // Clean up S3 PDFs
  for (const pdf of doc.pdfs) {
    try {
      await deleteS3Object(pdf.s3Key);
    } catch {
      // best-effort cleanup
    }
  }

  await PaperModel.deleteOne({ _id: doc._id });
}

// ─── Add Questions to Section ────────────────────────────────────────────────

export async function addQuestionsToSection(
  companyId: string,
  paperId: string,
  sectionIndex: number,
  questionIds: string[],
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });
  requireDraft(doc);

  if (sectionIndex < 0 || sectionIndex >= doc.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  // Validate questions exist and are approved
  const questions = await QuestionModel.find({
    _id: { $in: questionIds.map(toObjectId) },
    companyId: toObjectId(companyId),
    isArchived: false,
  });

  if (questions.length !== questionIds.length) {
    throw Object.assign(new Error("One or more questions not found or archived"), { status: 400 });
  }

  const section = doc.sections[sectionIndex];
  let nextNumber = section.questions.length
    ? Math.max(...section.questions.map((q) => q.questionNumber)) + 1
    : 1;

  for (const q of questions) {
    section.questions.push({
      questionId: q._id as mongoose.Types.ObjectId,
      questionNumber: nextNumber++,
      marks: (q.metadata as Record<string, number>)?.marks ?? 1,
      isRequired: true,
    });

    // Increment usage.paperCount
    await QuestionModel.updateOne(
      { _id: q._id },
      { $inc: { "usage.paperCount": 1 } }
    );
  }

  doc.updatedBy = userEmail;
  recalculateTotals(doc);
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Remove Question from Section ────────────────────────────────────────────

export async function removeQuestionFromSection(
  companyId: string,
  paperId: string,
  sectionIndex: number,
  questionNumber: number,
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });
  requireDraft(doc);

  if (sectionIndex < 0 || sectionIndex >= doc.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  const section = doc.sections[sectionIndex];
  const idx = section.questions.findIndex((q) => q.questionNumber === questionNumber);
  if (idx === -1) {
    throw Object.assign(new Error("Question not found in section"), { status: 404 });
  }

  const removed = section.questions[idx];
  section.questions.splice(idx, 1);

  // Renumber remaining
  section.questions.forEach((q, i) => {
    q.questionNumber = i + 1;
  });

  // Decrement usage.paperCount
  await QuestionModel.updateOne(
    { _id: removed.questionId },
    { $inc: { "usage.paperCount": -1 } }
  );

  doc.updatedBy = userEmail;
  recalculateTotals(doc);
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Reorder Questions in Section ────────────────────────────────────────────

export async function reorderQuestionsInSection(
  companyId: string,
  paperId: string,
  sectionIndex: number,
  orderedQuestionIds: string[],
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });
  requireDraft(doc);

  if (sectionIndex < 0 || sectionIndex >= doc.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  const section = doc.sections[sectionIndex];
  const qMap = new Map(
    section.questions.map((q) => [q.questionId.toString(), q])
  );

  const reordered = orderedQuestionIds.map((id, i) => {
    const q = qMap.get(id);
    if (!q) throw Object.assign(new Error(`Question ${id} not in section`), { status: 400 });
    return { ...JSON.parse(JSON.stringify(q)), questionNumber: i + 1 };
  });

  section.questions = reordered;
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Swap Question ───────────────────────────────────────────────────────────

export async function swapQuestion(
  companyId: string,
  paperId: string,
  sectionIndex: number,
  questionNumber: number,
  newQuestionId: string,
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });
  requireDraft(doc);

  if (sectionIndex < 0 || sectionIndex >= doc.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  const section = doc.sections[sectionIndex];
  const qIdx = section.questions.findIndex((q) => q.questionNumber === questionNumber);
  if (qIdx === -1) {
    throw Object.assign(new Error("Question not found in section"), { status: 404 });
  }

  const newQ = await QuestionModel.findOne({
    _id: toObjectId(newQuestionId),
    companyId: toObjectId(companyId),
    isArchived: false,
  });
  if (!newQ) {
    throw Object.assign(new Error("New question not found or archived"), { status: 404 });
  }

  const oldQuestionId = section.questions[qIdx].questionId;

  // Replace question, preserve position
  section.questions[qIdx] = {
    questionId: newQ._id as mongoose.Types.ObjectId,
    questionNumber,
    marks: (newQ.metadata as Record<string, number>)?.marks ?? section.questions[qIdx].marks,
    isRequired: section.questions[qIdx].isRequired,
  };

  // Update usage on both
  await Promise.all([
    QuestionModel.updateOne({ _id: oldQuestionId }, { $inc: { "usage.paperCount": -1 } }),
    QuestionModel.updateOne({ _id: newQ._id }, { $inc: { "usage.paperCount": 1 } }),
  ]);

  doc.updatedBy = userEmail;
  recalculateTotals(doc);
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Finalize ────────────────────────────────────────────────────────────────

export async function finalizePaper(
  companyId: string,
  paperId: string,
  userEmail: string
): Promise<{ paper: PaperDocument; jobId: string }> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });
  requireDraft(doc);

  // Validate non-empty sections
  if (!doc.sections.length) {
    throw Object.assign(new Error("Paper must have at least one section"), { status: 400 });
  }
  for (const section of doc.sections) {
    if (!section.questions.length) {
      throw Object.assign(
        new Error(`Section "${section.name}" has no questions`),
        { status: 400 }
      );
    }
  }

  doc.status = "finalized";
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();

  // Queue PDF generation
  const job = await addPdfGenerationJob(doc._id!.toString());

  return { paper: doc, jobId: job.id ?? "" };
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export async function publishPaper(
  companyId: string,
  paperId: string,
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });

  if (doc.status !== "finalized") {
    throw Object.assign(
      new Error("Paper must be finalized before publishing"),
      { status: 400 }
    );
  }

  if (!doc.pdfs.length) {
    throw Object.assign(
      new Error("Paper must have generated PDFs before publishing"),
      { status: 400 }
    );
  }

  doc.status = "published";
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Unfinalize ──────────────────────────────────────────────────────────────

export async function unfinalizePaper(
  companyId: string,
  paperId: string,
  userEmail: string
): Promise<PaperDocument> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });

  if (doc.status !== "finalized") {
    throw Object.assign(
      new Error("Only finalized papers can be unfinalized"),
      { status: 400 }
    );
  }

  // Clean up S3 PDFs
  for (const pdf of doc.pdfs) {
    try {
      await deleteS3Object(pdf.s3Key);
    } catch {
      // best-effort cleanup
    }
  }

  doc.pdfs = [];
  doc.status = "draft";
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── PDF Download URL ────────────────────────────────────────────────────────

export async function getPaperPdfDownloadUrl(
  companyId: string,
  paperId: string,
  pdfType: PdfType
): Promise<string> {
  const doc = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: toObjectId(companyId),
  });
  if (!doc) throw Object.assign(new Error("Paper not found"), { status: 404 });

  const pdf = doc.pdfs.find((p) => p.type === pdfType);
  if (!pdf) {
    throw Object.assign(new Error(`PDF of type "${pdfType}" not found`), { status: 404 });
  }

  return getPresignedDownloadUrl(pdf.s3Key, 900);
}

// ─── Stats ───────────────────────────────────────────────────────────────────

interface PaperStats {
  byStatus: { status: string; count: number }[];
  byTemplate: { templateId: string; templateName: string; count: number }[];
  totalPdfs: number;
  avgQuestionsPerPaper: number;
}

export async function getPaperStats(companyId: string): Promise<PaperStats> {
  const companyOid = toObjectId(companyId);

  const [byStatus, byTemplate, pdfCount, avgQuestions] = await Promise.all([
    PaperModel.aggregate([
      { $match: { companyId: companyOid } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PaperModel.aggregate([
      { $match: { companyId: companyOid } },
      { $group: { _id: "$templateId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "papertemplates",
          localField: "_id",
          foreignField: "_id",
          as: "template",
        },
      },
      { $unwind: { path: "$template", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          templateId: "$_id",
          templateName: { $ifNull: ["$template.name", "Unknown"] },
          count: 1,
        },
      },
    ]),
    PaperModel.aggregate([
      { $match: { companyId: companyOid } },
      { $project: { pdfCount: { $size: "$pdfs" } } },
      { $group: { _id: null, total: { $sum: "$pdfCount" } } },
    ]),
    PaperModel.aggregate([
      { $match: { companyId: companyOid } },
      { $project: { qCount: { $reduce: { input: "$sections", initialValue: 0, in: { $add: ["$$value", { $size: "$$this.questions" }] } } } } },
      { $group: { _id: null, avg: { $avg: "$qCount" } } },
    ]),
  ]);

  return {
    byStatus: byStatus.map((s: { _id: string; count: number }) => ({
      status: s._id,
      count: s.count,
    })),
    byTemplate: byTemplate.map((t: { templateId: string; templateName: string; count: number }) => ({
      templateId: t.templateId?.toString() ?? "",
      templateName: t.templateName ?? "Unknown",
      count: t.count,
    })),
    totalPdfs: pdfCount[0]?.total ?? 0,
    avgQuestionsPerPaper: Math.round((avgQuestions[0]?.avg ?? 0) * 10) / 10,
  };
}
