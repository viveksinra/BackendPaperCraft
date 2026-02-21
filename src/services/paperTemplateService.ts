import mongoose from "mongoose";
import {
  PaperTemplateModel,
  PaperTemplateDocument,
} from "../models/paperTemplate";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ObjectId");
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createTemplate(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperTemplateDocument> {
  const doc = await PaperTemplateModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    name: input.name,
    description: input.description || "",
    layout: input.layout || {},
    isPreBuilt: false,
    isActive: true,
    createdBy: userEmail,
    updatedBy: userEmail,
  });
  return doc;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listTemplates(
  companyId: string,
  filters?: { search?: string; isPreBuilt?: boolean }
): Promise<PaperTemplateDocument[]> {
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

  return PaperTemplateModel.find(query).sort({ isPreBuilt: -1, name: 1 });
}

// ─── Get by ID ───────────────────────────────────────────────────────────────

export async function getTemplateById(
  companyId: string,
  templateId: string
): Promise<PaperTemplateDocument> {
  const doc = await PaperTemplateModel.findOne({
    _id: toObjectId(templateId),
    isActive: true,
    $or: [
      { companyId: toObjectId(companyId) },
      { isPreBuilt: true },
    ],
  });
  if (!doc) {
    throw Object.assign(new Error("Template not found"), { status: 404 });
  }
  return doc;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateTemplate(
  companyId: string,
  templateId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<PaperTemplateDocument> {
  const doc = await getTemplateById(companyId, templateId);

  if (doc.isPreBuilt) {
    throw Object.assign(
      new Error("Cannot modify a pre-built template. Clone it first."),
      { status: 400 }
    );
  }

  // Deep merge layout fields
  if (input.layout && typeof input.layout === "object") {
    const layoutUpdate = input.layout as Record<string, unknown>;
    const existing = JSON.parse(JSON.stringify(doc.layout ?? {}));
    for (const section of ["header", "instructions", "sections", "footer", "formatting"] as const) {
      if (layoutUpdate[section] && typeof layoutUpdate[section] === "object") {
        (layoutUpdate as Record<string, unknown>)[section] = {
          ...(existing as Record<string, unknown>)[section] as object,
          ...(layoutUpdate[section] as object),
        };
      }
    }
    doc.set("layout", { ...existing, ...layoutUpdate });
  }

  if (input.name !== undefined) doc.name = input.name as string;
  if (input.description !== undefined) doc.description = input.description as string;
  doc.updatedBy = userEmail;

  await doc.save();
  return doc;
}

// ─── Clone ───────────────────────────────────────────────────────────────────

export async function cloneTemplate(
  companyId: string,
  templateId: string,
  userEmail: string
): Promise<PaperTemplateDocument> {
  const source = await getTemplateById(companyId, templateId);
  const plain = source.toObject();

  delete (plain as Record<string, unknown>)._id;
  delete (plain as Record<string, unknown>).createdAt;
  delete (plain as Record<string, unknown>).updatedAt;
  delete (plain as Record<string, unknown>).__v;

  const doc = await PaperTemplateModel.create({
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

export async function deleteTemplate(
  companyId: string,
  templateId: string
): Promise<void> {
  const doc = await getTemplateById(companyId, templateId);

  if (doc.isPreBuilt) {
    throw Object.assign(
      new Error("Cannot delete a pre-built template"),
      { status: 400 }
    );
  }

  doc.isActive = false;
  await doc.save();
}
