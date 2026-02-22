import mongoose from "mongoose";
import { QuestionModel, QuestionDocument, ReviewStatus } from "../models/question";
import { SubjectModel } from "../models/subject";
import { incrementQuestionCount } from "./subjectService";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create Question ────────────────────────────────────────────────────────

export async function createQuestion(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<QuestionDocument> {
  const companyOid = toObjectId(companyId);

  const doc = await QuestionModel.create({
    tenantId,
    companyId: companyOid,
    type: input.type,
    content: input.content || {},
    metadata: {
      difficulty: "medium",
      marks: 1,
      negativeMarks: 0,
      expectedTime: 60,
      examTypes: [],
      tags: [],
      language: "en",
      ...(input.metadata as Record<string, unknown> || {}),
    },
    usage: {
      paperCount: 0,
      testCount: 0,
      homeworkCount: 0,
      history: [],
    },
    review: {
      status: "draft",
    },
    performance: {
      totalAttempts: 0,
      correctAttempts: 0,
      avgScore: 0,
      avgTimeSpent: 0,
      discriminationIndex: 0,
      difficultyIndex: 0,
    },
    isArchived: false,
    version: 1,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  // Increment subject question count
  const meta = input.metadata as Record<string, unknown> | undefined;
  if (meta?.subjectId) {
    await incrementQuestionCount(meta.subjectId as string, 1);
  }

  return doc;
}

// ─── Get Question By ID ─────────────────────────────────────────────────────

export async function getQuestionById(
  companyId: string,
  questionId: string
): Promise<QuestionDocument> {
  const doc = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  })
    .populate("metadata.subjectId", "name level")
    .populate("metadata.chapterId", "name level")
    .populate("metadata.topicId", "name level")
    .populate("metadata.subtopicId", "name level");

  if (!doc) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }
  return doc;
}

// ─── List Questions ─────────────────────────────────────────────────────────

interface ListFilters {
  search?: string;
  type?: string;
  difficulty?: string;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  status?: string;
  archived?: boolean;
  tags?: string;
  examType?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listQuestions(
  companyId: string,
  filters?: ListFilters,
  pagination?: PaginationOpts
): Promise<{ questions: QuestionDocument[]; total: number }> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  // Default: don't show archived unless explicitly requested
  if (filters?.archived === true) {
    query.isArchived = true;
  } else {
    query.isArchived = false;
  }

  if (filters?.type) query.type = filters.type;
  if (filters?.difficulty) query["metadata.difficulty"] = filters.difficulty;
  if (filters?.subjectId) query["metadata.subjectId"] = toObjectId(filters.subjectId);
  if (filters?.chapterId) query["metadata.chapterId"] = toObjectId(filters.chapterId);
  if (filters?.topicId) query["metadata.topicId"] = toObjectId(filters.topicId);
  if (filters?.status) query["review.status"] = filters.status;
  if (filters?.examType) query["metadata.examTypes"] = filters.examType;
  if (filters?.tags) {
    const tagList = filters.tags.split(",").map((t) => t.trim().toLowerCase());
    query["metadata.tags"] = { $in: tagList };
  }

  if (filters?.search) {
    query.$text = { $search: filters.search };
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortBy = pagination?.sortBy ?? "createdAt";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [questions, total] = await Promise.all([
    QuestionModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("metadata.subjectId", "name level")
      .populate("metadata.chapterId", "name level")
      .populate("metadata.topicId", "name level"),
    QuestionModel.countDocuments(query),
  ]);

  return { questions, total };
}

// ─── Update Question ────────────────────────────────────────────────────────

export async function updateQuestion(
  companyId: string,
  questionId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<QuestionDocument> {
  const doc = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }

  // Optimistic concurrency check
  if (input.version !== undefined && input.version !== doc.version) {
    throw Object.assign(
      new Error("Question has been modified by another user. Please refresh and try again."),
      { status: 409 }
    );
  }

  // Handle subject change
  const newMeta = input.metadata as Record<string, unknown> | undefined;
  if (newMeta?.subjectId !== undefined) {
    const oldSubjectId = doc.metadata?.subjectId?.toString();
    const newSubjectId = newMeta.subjectId as string;
    if (oldSubjectId && oldSubjectId !== newSubjectId) {
      await incrementQuestionCount(oldSubjectId, -1);
    }
    if (newSubjectId && oldSubjectId !== newSubjectId) {
      await incrementQuestionCount(newSubjectId, 1);
    }
  }

  if (input.type !== undefined) doc.type = input.type as QuestionDocument["type"];
  if (input.content !== undefined) {
    const contentUpdate = input.content as Record<string, unknown>;
    doc.content = { ...doc.content, ...contentUpdate } as QuestionDocument["content"];
  }
  if (newMeta) {
    doc.metadata = { ...doc.metadata, ...newMeta } as QuestionDocument["metadata"];
  }

  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Archive Question ───────────────────────────────────────────────────────

export async function archiveQuestion(
  companyId: string,
  questionId: string,
  userEmail: string
): Promise<QuestionDocument> {
  const doc = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }
  if (doc.isArchived) {
    throw Object.assign(new Error("Question is already archived"), { status: 400 });
  }

  doc.isArchived = true;
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();

  if (doc.metadata?.subjectId) {
    await incrementQuestionCount(doc.metadata.subjectId.toString(), -1);
  }

  return doc;
}

// ─── Restore Question ───────────────────────────────────────────────────────

export async function restoreQuestion(
  companyId: string,
  questionId: string,
  userEmail: string
): Promise<QuestionDocument> {
  const doc = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }
  if (!doc.isArchived) {
    throw Object.assign(new Error("Question is not archived"), { status: 400 });
  }

  doc.isArchived = false;
  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();

  if (doc.metadata?.subjectId) {
    await incrementQuestionCount(doc.metadata.subjectId.toString(), 1);
  }

  return doc;
}

// ─── Duplicate Question ─────────────────────────────────────────────────────

export async function duplicateQuestion(
  companyId: string,
  questionId: string,
  userEmail: string
): Promise<QuestionDocument> {
  const original = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  });
  if (!original) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }

  const clone = await QuestionModel.create({
    tenantId: original.tenantId,
    companyId: original.companyId,
    type: original.type,
    content: JSON.parse(JSON.stringify(original.content)),
    metadata: JSON.parse(JSON.stringify(original.metadata)),
    usage: {
      paperCount: 0,
      testCount: 0,
      homeworkCount: 0,
      history: [],
    },
    review: {
      status: "draft",
    },
    performance: {
      totalAttempts: 0,
      correctAttempts: 0,
      avgScore: 0,
      avgTimeSpent: 0,
      discriminationIndex: 0,
      difficultyIndex: 0,
    },
    isArchived: false,
    version: 1,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  if (clone.metadata?.subjectId) {
    await incrementQuestionCount(clone.metadata.subjectId.toString(), 1);
  }

  return clone;
}

// ─── Review Question ────────────────────────────────────────────────────────

const REVIEW_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_review"],
  pending_review: ["approved", "rejected"],
  rejected: ["pending_review"],
  approved: [],
};

export async function reviewQuestion(
  companyId: string,
  questionId: string,
  action: "submit" | "approve" | "reject",
  notes: string | undefined,
  userEmail: string
): Promise<QuestionDocument> {
  const doc = await QuestionModel.findOne({
    _id: toObjectId(questionId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }

  const currentStatus = doc.review?.status || "draft";
  let newStatus: ReviewStatus;

  if (action === "submit") {
    newStatus = "pending_review";
  } else if (action === "approve") {
    newStatus = "approved";
  } else {
    newStatus = "rejected";
  }

  const allowed = REVIEW_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw Object.assign(
      new Error(`Cannot transition from '${currentStatus}' to '${newStatus}'`),
      { status: 400 }
    );
  }

  doc.review = {
    ...doc.review,
    status: newStatus,
    notes: notes || doc.review?.notes,
  };

  if (action === "submit") {
    doc.review.submittedAt = new Date();
    doc.review.submittedBy = userEmail;
  } else {
    doc.review.reviewedAt = new Date();
    doc.review.reviewedBy = userEmail;
    if (action === "reject" && notes) {
      doc.review.rejectionReason = notes;
    }
  }

  doc.updatedBy = userEmail;
  doc.version += 1;
  await doc.save();
  return doc;
}

// ─── Question Stats ─────────────────────────────────────────────────────────

interface QuestionStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
  byDifficulty: { difficulty: string; count: number }[];
  archived: number;
}

export async function getQuestionStats(companyId: string): Promise<QuestionStats> {
  const companyOid = toObjectId(companyId);

  const [total, archived, byStatus, byType, byDifficulty] = await Promise.all([
    QuestionModel.countDocuments({ companyId: companyOid, isArchived: false }),
    QuestionModel.countDocuments({ companyId: companyOid, isArchived: true }),
    QuestionModel.aggregate([
      { $match: { companyId: companyOid, isArchived: false } },
      { $group: { _id: "$review.status", count: { $sum: 1 } } },
    ]),
    QuestionModel.aggregate([
      { $match: { companyId: companyOid, isArchived: false } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    QuestionModel.aggregate([
      { $match: { companyId: companyOid, isArchived: false } },
      { $group: { _id: "$metadata.difficulty", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    total,
    archived,
    byStatus: byStatus.map((s: { _id: string; count: number }) => ({
      status: s._id || "draft",
      count: s.count,
    })),
    byType: byType.map((t: { _id: string; count: number }) => ({
      type: t._id,
      count: t.count,
    })),
    byDifficulty: byDifficulty.map((d: { _id: string; count: number }) => ({
      difficulty: d._id || "medium",
      count: d.count,
    })),
  };
}
