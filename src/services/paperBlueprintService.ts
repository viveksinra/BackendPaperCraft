import mongoose from "mongoose";
import {
  PaperBlueprintModel,
  PaperBlueprintDocument,
} from "../models/paperBlueprint";
import { QuestionModel } from "../models/question";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createBlueprint(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperBlueprintDocument> {
  const doc = await PaperBlueprintModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    name: input.name,
    description: input.description || "",
    totalMarks: input.totalMarks,
    totalTime: input.totalTime,
    sections: input.sections,
    constraints: input.constraints || {},
    isPreBuilt: false,
    isActive: true,
    createdBy: userEmail,
    updatedBy: userEmail,
  });
  return doc;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listBlueprints(
  companyId: string,
  filters?: { search?: string; isPreBuilt?: boolean }
): Promise<PaperBlueprintDocument[]> {
  const query: Record<string, unknown> = {
    isActive: true,
    $or: [
      { companyId: toObjectId(companyId) },
      { isPreBuilt: true },
    ],
  };

  if (filters?.isPreBuilt !== undefined) {
    query.isPreBuilt = filters.isPreBuilt;
  }

  if (filters?.search) {
    query.name = { $regex: filters.search, $options: "i" };
  }

  return PaperBlueprintModel.find(query).sort({ isPreBuilt: -1, name: 1 });
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getBlueprintById(
  companyId: string,
  blueprintId: string
): Promise<PaperBlueprintDocument> {
  const doc = await PaperBlueprintModel.findOne({
    _id: toObjectId(blueprintId),
    isActive: true,
    $or: [
      { companyId: toObjectId(companyId) },
      { isPreBuilt: true },
    ],
  });
  if (!doc) {
    throw Object.assign(new Error("Blueprint not found"), { status: 404 });
  }
  return doc;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateBlueprint(
  companyId: string,
  blueprintId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperBlueprintDocument> {
  const doc = await getBlueprintById(companyId, blueprintId);

  if (doc.isPreBuilt) {
    throw Object.assign(
      new Error("Cannot modify a pre-built blueprint. Clone it first."),
      { status: 400 }
    );
  }

  if (input.name !== undefined) doc.name = input.name as string;
  if (input.description !== undefined) doc.description = input.description as string;
  if (input.totalMarks !== undefined) doc.totalMarks = input.totalMarks as number;
  if (input.totalTime !== undefined) doc.totalTime = input.totalTime as number;
  if (input.sections !== undefined) doc.sections = input.sections as typeof doc.sections;
  if (input.constraints !== undefined) {
    const existing = JSON.parse(JSON.stringify(doc.constraints ?? {}));
    doc.constraints = { ...existing, ...(input.constraints as object) } as typeof doc.constraints;
  }
  doc.updatedBy = userEmail;

  await doc.save();
  return doc;
}

// ─── Clone ───────────────────────────────────────────────────────────────────

export async function cloneBlueprint(
  companyId: string,
  blueprintId: string,
  userEmail: string
): Promise<PaperBlueprintDocument> {
  const source = await getBlueprintById(companyId, blueprintId);
  const plain = source.toObject();

  delete (plain as Record<string, unknown>)._id;
  delete (plain as Record<string, unknown>).createdAt;
  delete (plain as Record<string, unknown>).updatedAt;
  delete (plain as Record<string, unknown>).__v;

  const doc = await PaperBlueprintModel.create({
    ...plain,
    companyId: toObjectId(companyId),
    name: `${source.name} (Custom)`,
    isPreBuilt: false,
    isActive: true,
    createdBy: userEmail,
    updatedBy: userEmail,
  });
  return doc;
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

export async function deleteBlueprint(
  companyId: string,
  blueprintId: string
): Promise<void> {
  const doc = await getBlueprintById(companyId, blueprintId);

  if (doc.isPreBuilt) {
    throw Object.assign(
      new Error("Cannot delete a pre-built blueprint"),
      { status: 400 }
    );
  }

  doc.isActive = false;
  await doc.save();
}

// ─── Feasibility Validation ──────────────────────────────────────────────────

interface FeasibilitySection {
  name: string;
  required: number;
  available: number;
  shortfall: number;
}

interface FeasibilityResult {
  feasible: boolean;
  sections: FeasibilitySection[];
}

export async function validateBlueprintFeasibility(
  companyId: string,
  blueprintId: string
): Promise<FeasibilityResult> {
  const blueprint = await getBlueprintById(companyId, blueprintId);
  const companyOid = toObjectId(companyId);
  const sections: FeasibilitySection[] = [];

  for (const section of blueprint.sections) {
    const filter: Record<string, unknown> = {
      companyId: companyOid,
      isArchived: false,
    };

    // Filter by question types
    if (section.questionTypes?.length) {
      filter.type = { $in: section.questionTypes };
    }

    // Filter by subject if specified
    if (section.subjectId) {
      filter["metadata.subjectId"] = section.subjectId;
    }

    // Filter by approved status if required
    if (blueprint.constraints?.requireApprovedOnly) {
      filter["review.status"] = "approved";
    }

    // Exclude recently used questions if configured
    if (blueprint.constraints?.excludeRecentlyUsed) {
      const windowDays = blueprint.constraints.recentlyUsedWindow || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - windowDays);
      filter["usage.lastUsedAt"] = { $not: { $gte: cutoff } };
    }

    // Exclude specific question IDs
    if (blueprint.constraints?.excludeQuestionIds?.length) {
      filter._id = { $nin: blueprint.constraints.excludeQuestionIds };
    }

    const available = await QuestionModel.countDocuments(filter);
    const required = section.questionCount;

    sections.push({
      name: section.name,
      required,
      available,
      shortfall: Math.max(0, required - available),
    });
  }

  return {
    feasible: sections.every((s) => s.shortfall === 0),
    sections,
  };
}
