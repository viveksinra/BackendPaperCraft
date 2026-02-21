import mongoose from "mongoose";
import { PaperModel, PaperDocument } from "../models/paper";
import {
  PaperBlueprintModel,
  PaperBlueprintDocument,
  BlueprintSection,
  BlueprintConstraints,
} from "../models/paperBlueprint";
import { PaperTemplateModel } from "../models/paperTemplate";
import { QuestionModel, QuestionDocument } from "../models/question";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

interface SelectedQuestion {
  questionId: mongoose.Types.ObjectId;
  marks: number;
}

// ─── Auto-Generate Paper ─────────────────────────────────────────────────────

export async function autoGeneratePaper(
  companyId: string,
  tenantId: string,
  blueprintId: string,
  templateId: string,
  title: string,
  overrideConstraints: Record<string, unknown> | undefined,
  userEmail: string
): Promise<PaperDocument> {
  const companyOid = toObjectId(companyId);

  // Load blueprint
  const blueprint = await PaperBlueprintModel.findOne({
    _id: toObjectId(blueprintId),
    isActive: true,
    $or: [{ companyId: companyOid }, { isPreBuilt: true }],
  });
  if (!blueprint) {
    throw Object.assign(new Error("Blueprint not found"), { status: 404 });
  }

  // Validate template exists
  const template = await PaperTemplateModel.findOne({
    _id: toObjectId(templateId),
    isActive: true,
    $or: [{ companyId: companyOid }, { isPreBuilt: true }],
  });
  if (!template) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }

  // Merge constraints
  const constraints: BlueprintConstraints = {
    ...JSON.parse(JSON.stringify(blueprint.constraints ?? {})),
    ...(overrideConstraints ?? {}),
  } as BlueprintConstraints;

  const alreadySelectedIds = new Set<string>();
  const sections = [];

  for (const section of blueprint.sections) {
    const selected = await selectQuestionsForSection(
      companyId,
      section,
      constraints,
      alreadySelectedIds
    );

    // Track selected IDs across sections
    for (const q of selected) {
      alreadySelectedIds.add(q.questionId.toString());
    }

    sections.push({
      name: section.name,
      instructions: section.instructions || "",
      timeLimit: section.timeLimit || 0,
      questions: selected.map((q, i) => ({
        questionId: q.questionId,
        questionNumber: i + 1,
        marks: q.marks,
        isRequired: true,
      })),
    });
  }

  // Calculate totals
  let totalMarks = 0;
  let totalTime = 0;
  for (const s of sections) {
    totalTime += s.timeLimit;
    for (const q of s.questions) {
      totalMarks += q.marks;
    }
  }

  // Create draft paper
  const paper = await PaperModel.create({
    tenantId,
    companyId: companyOid,
    title,
    description: `Auto-generated from blueprint: ${blueprint.name}`,
    templateId: toObjectId(templateId),
    blueprintId: toObjectId(blueprintId),
    sections,
    totalMarks,
    totalTime: totalTime || blueprint.totalTime,
    status: "draft",
    pdfs: [],
    version: 1,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  // Update usage.paperCount for all selected questions
  const allQuestionIds = sections.flatMap((s) =>
    s.questions.map((q) => q.questionId)
  );
  if (allQuestionIds.length) {
    await QuestionModel.updateMany(
      { _id: { $in: allQuestionIds } },
      { $inc: { "usage.paperCount": 1 }, $set: { "usage.lastUsedAt": new Date() } }
    );
  }

  return paper;
}

// ─── Select Questions for Section (Multi-Pass) ──────────────────────────────

export async function selectQuestionsForSection(
  companyId: string,
  section: BlueprintSection,
  constraints: BlueprintConstraints,
  alreadySelectedIds: Set<string>
): Promise<SelectedQuestion[]> {
  const companyOid = toObjectId(companyId);
  const needed = section.questionCount;

  // ── Pass 1: Build candidate pool ──────────────────────────────────────
  const filter: Record<string, unknown> = {
    companyId: companyOid,
    isArchived: false,
  };

  if (section.questionTypes?.length) {
    filter.type = { $in: section.questionTypes };
  }

  if (section.subjectId) {
    filter["metadata.subjectId"] = section.subjectId;
  }

  if (constraints.requireApprovedOnly) {
    filter["review.status"] = "approved";
  }

  // Exclude recently used
  if (constraints.excludeRecentlyUsed) {
    const windowDays = constraints.recentlyUsedWindow || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    filter["usage.lastUsedAt"] = { $not: { $gte: cutoff } };
  }

  // Exclude specific IDs + already selected
  const excludeIds = [
    ...(constraints.excludeQuestionIds?.map((id) => id.toString()) ?? []),
    ...Array.from(alreadySelectedIds),
  ].map(toObjectId);

  if (excludeIds.length) {
    filter._id = { $nin: excludeIds };
  }

  const candidates = await QuestionModel.find(filter).lean();
  if (!candidates.length) return [];

  // ── Pass 2: Apply topic distribution ──────────────────────────────────
  let selectedByTopic: QuestionDocument[] = [];

  if (section.topicDistribution?.length) {
    for (const td of section.topicDistribution) {
      const topicId = td.topicId.toString();
      const count = Math.round((td.percentage / 100) * needed);
      const matching = candidates.filter(
        (q) => (q.metadata as Record<string, unknown>)?.subjectId?.toString() === topicId
      );
      shuffleArray(matching);
      selectedByTopic.push(...matching.slice(0, count) as unknown as QuestionDocument[]);
    }
  } else {
    // No topic distribution — use all candidates
    shuffleArray(candidates);
    selectedByTopic = candidates.slice(0, needed) as unknown as QuestionDocument[];
  }

  // ── Pass 3: Apply difficulty mix ──────────────────────────────────────
  const mix = section.difficultyMix;
  const selectedByDifficulty: QuestionDocument[] = [];

  if (mix && selectedByTopic.length) {
    const difficultyTargets = [
      { level: "easy", target: Math.round((mix.easy / 100) * needed) },
      { level: "medium", target: Math.round((mix.medium / 100) * needed) },
      { level: "hard", target: Math.round((mix.hard / 100) * needed) },
      { level: "expert", target: Math.round((mix.expert / 100) * needed) },
    ];

    const usedIds = new Set<string>();

    for (const { level, target } of difficultyTargets) {
      const matching = selectedByTopic.filter(
        (q) =>
          (q.metadata as Record<string, unknown>)?.difficulty === level &&
          !usedIds.has((q._id as mongoose.Types.ObjectId).toString())
      );
      shuffleArray(matching);
      const picked = matching.slice(0, target);
      for (const q of picked) {
        usedIds.add((q._id as mongoose.Types.ObjectId).toString());
        selectedByDifficulty.push(q);
      }
    }

    // Fill any remaining from unused topic-selected questions
    if (selectedByDifficulty.length < needed) {
      const remaining = selectedByTopic.filter(
        (q) => !usedIds.has((q._id as mongoose.Types.ObjectId).toString())
      );
      shuffleArray(remaining);
      for (const q of remaining) {
        if (selectedByDifficulty.length >= needed) break;
        selectedByDifficulty.push(q);
      }
    }
  }

  // ── Pass 4: Fill remaining slots ──────────────────────────────────────
  const finalPool = selectedByDifficulty.length ? selectedByDifficulty : selectedByTopic;
  const selectedIds = new Set(
    finalPool.map((q) => (q._id as mongoose.Types.ObjectId).toString())
  );

  if (finalPool.length < needed) {
    const extras = candidates.filter(
      (q) => !selectedIds.has((q._id as mongoose.Types.ObjectId).toString())
    );
    shuffleArray(extras);
    for (const q of extras) {
      if (finalPool.length >= needed) break;
      finalPool.push(q as unknown as QuestionDocument);
    }
  }

  // Map to result format
  return finalPool.slice(0, needed).map((q) => ({
    questionId: q._id as mongoose.Types.ObjectId,
    marks: (q.metadata as Record<string, number>)?.marks ?? section.marksPerQuestion ?? 1,
  }));
}

// ─── Suggested Swaps ─────────────────────────────────────────────────────────

export async function getSuggestedSwaps(
  companyId: string,
  paperId: string,
  sectionIndex: number,
  questionNumber: number
): Promise<QuestionDocument[]> {
  const companyOid = toObjectId(companyId);

  const paper = await PaperModel.findOne({
    _id: toObjectId(paperId),
    companyId: companyOid,
  });
  if (!paper) throw Object.assign(new Error("Paper not found"), { status: 404 });

  if (sectionIndex < 0 || sectionIndex >= paper.sections.length) {
    throw Object.assign(new Error("Invalid section index"), { status: 400 });
  }

  const section = paper.sections[sectionIndex];
  const currentQ = section.questions.find((q) => q.questionNumber === questionNumber);
  if (!currentQ) {
    throw Object.assign(new Error("Question not found in section"), { status: 404 });
  }

  // Get the current question's criteria
  const currentQuestion = await QuestionModel.findById(currentQ.questionId);
  if (!currentQuestion) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }

  // Collect all question IDs already in the paper
  const paperQuestionIds = paper.sections.flatMap((s) =>
    s.questions.map((q) => q.questionId)
  );

  // Find alternatives matching same criteria
  const filter: Record<string, unknown> = {
    companyId: companyOid,
    isArchived: false,
    _id: { $nin: paperQuestionIds },
    type: currentQuestion.type,
  };

  const metadata = currentQuestion.metadata as Record<string, unknown>;
  if (metadata?.subjectId) {
    filter["metadata.subjectId"] = metadata.subjectId;
  }
  if (metadata?.difficulty) {
    filter["metadata.difficulty"] = metadata.difficulty;
  }

  const alternatives = await QuestionModel.find(filter)
    .sort({ "usage.paperCount": 1 })
    .limit(10)
    .lean();

  return alternatives as unknown as QuestionDocument[];
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
