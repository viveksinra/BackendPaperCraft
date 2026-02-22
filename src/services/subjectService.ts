import mongoose from "mongoose";
import { SubjectModel, SubjectDocument } from "../models/subject";
import { QuestionModel } from "../models/question";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Create Subject ─────────────────────────────────────────────────────────

export async function createSubject(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<SubjectDocument> {
  const companyOid = toObjectId(companyId);
  const name = input.name as string;
  const level = input.level as string;
  const parentId = input.parentId ? toObjectId(input.parentId as string) : null;
  const description = (input.description as string) || "";

  // Build path from parent
  let path: mongoose.Types.ObjectId[] = [];
  if (parentId) {
    const parent = await SubjectModel.findOne({
      _id: parentId,
      companyId: companyOid,
      isActive: true,
    });
    if (!parent) {
      throw Object.assign(new Error("Parent subject not found"), { status: 404 });
    }
    path = [...parent.path, parent._id as mongoose.Types.ObjectId];
  }

  // Auto slug with uniqueness
  let slug = slugify(name);
  const existing = await SubjectModel.findOne({ companyId: companyOid, slug });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // Auto sort order
  const maxSort = await SubjectModel.findOne({
    companyId: companyOid,
    parentId: parentId || null,
  })
    .sort({ sortOrder: -1 })
    .select("sortOrder");
  const sortOrder = (maxSort?.sortOrder ?? -1) + 1;

  const doc = await SubjectModel.create({
    tenantId,
    companyId: companyOid,
    name,
    slug,
    level,
    parentId,
    path,
    sortOrder,
    description,
    questionCount: 0,
    isActive: true,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  return doc;
}

// ─── Get Subject Tree ───────────────────────────────────────────────────────

export async function getSubjectTree(
  companyId: string
): Promise<SubjectDocument[]> {
  return SubjectModel.find({
    companyId: toObjectId(companyId),
    isActive: true,
  })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
}

// ─── Get Subject By ID ──────────────────────────────────────────────────────

export async function getSubjectById(
  companyId: string,
  subjectId: string
): Promise<SubjectDocument> {
  const doc = await SubjectModel.findOne({
    _id: toObjectId(subjectId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Subject not found"), { status: 404 });
  }
  return doc;
}

// ─── Update Subject ─────────────────────────────────────────────────────────

export async function updateSubject(
  companyId: string,
  subjectId: string,
  input: Record<string, unknown>,
  userEmail: string
): Promise<SubjectDocument> {
  const doc = await SubjectModel.findOne({
    _id: toObjectId(subjectId),
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Subject not found"), { status: 404 });
  }

  if (input.name !== undefined) {
    doc.name = input.name as string;
    doc.slug = slugify(input.name as string);
    // Check slug uniqueness
    const existing = await SubjectModel.findOne({
      companyId: doc.companyId,
      slug: doc.slug,
      _id: { $ne: doc._id },
    });
    if (existing) {
      doc.slug = `${doc.slug}-${Date.now()}`;
    }
  }
  if (input.description !== undefined) doc.description = input.description as string;
  if (input.isActive !== undefined) doc.isActive = input.isActive as boolean;
  doc.updatedBy = userEmail;

  await doc.save();
  return doc;
}

// ─── Move Subject ───────────────────────────────────────────────────────────

export async function moveSubject(
  companyId: string,
  subjectId: string,
  newParentId: string | null,
  newSortOrder: number | undefined,
  userEmail: string
): Promise<SubjectDocument> {
  const companyOid = toObjectId(companyId);
  const doc = await SubjectModel.findOne({
    _id: toObjectId(subjectId),
    companyId: companyOid,
  });
  if (!doc) {
    throw Object.assign(new Error("Subject not found"), { status: 404 });
  }

  const newParentOid = newParentId ? toObjectId(newParentId) : null;

  // Prevent circular reference
  if (newParentOid) {
    if (newParentOid.equals(doc._id as mongoose.Types.ObjectId)) {
      throw Object.assign(new Error("Cannot move subject under itself"), { status: 400 });
    }
    const newParent = await SubjectModel.findOne({
      _id: newParentOid,
      companyId: companyOid,
    });
    if (!newParent) {
      throw Object.assign(new Error("New parent not found"), { status: 404 });
    }
    // Check if new parent is a descendant of this subject
    if (newParent.path.some((p) => p.equals(doc._id as mongoose.Types.ObjectId))) {
      throw Object.assign(new Error("Cannot move subject under its own descendant"), { status: 400 });
    }
    doc.parentId = newParentOid;
    doc.path = [...newParent.path, newParent._id as mongoose.Types.ObjectId];
  } else {
    doc.parentId = null;
    doc.path = [];
  }

  if (newSortOrder !== undefined) {
    doc.sortOrder = newSortOrder;
  }
  doc.updatedBy = userEmail;
  await doc.save();

  // Recursively update paths of all children
  await updateChildPaths(companyOid, doc);

  return doc;
}

async function updateChildPaths(
  companyId: mongoose.Types.ObjectId,
  parent: SubjectDocument
): Promise<void> {
  const children = await SubjectModel.find({
    companyId,
    parentId: parent._id,
  });
  for (const child of children) {
    child.path = [...parent.path, parent._id as mongoose.Types.ObjectId];
    await child.save();
    await updateChildPaths(companyId, child);
  }
}

// ─── Delete Subject ─────────────────────────────────────────────────────────

export async function deleteSubject(
  companyId: string,
  subjectId: string
): Promise<void> {
  const companyOid = toObjectId(companyId);
  const subjectOid = toObjectId(subjectId);

  // Check for children
  const childCount = await SubjectModel.countDocuments({
    companyId: companyOid,
    parentId: subjectOid,
    isActive: true,
  });
  if (childCount > 0) {
    throw Object.assign(
      new Error("Cannot delete subject with active children. Remove children first."),
      { status: 400 }
    );
  }

  // Check for questions
  const questionCount = await QuestionModel.countDocuments({
    companyId: companyOid,
    "metadata.subjectId": subjectOid,
    isArchived: false,
  });
  if (questionCount > 0) {
    throw Object.assign(
      new Error("Cannot delete subject with active questions. Archive or reassign questions first."),
      { status: 400 }
    );
  }

  // Soft delete
  await SubjectModel.updateOne(
    { _id: subjectOid, companyId: companyOid },
    { $set: { isActive: false } }
  );
}

// ─── Reorder Subjects ───────────────────────────────────────────────────────

export async function reorderSubjects(
  companyId: string,
  parentId: string | null,
  orderedIds: string[]
): Promise<void> {
  const companyOid = toObjectId(companyId);
  const parentOid = parentId ? toObjectId(parentId) : null;

  const bulkOps = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: toObjectId(id), companyId: companyOid, parentId: parentOid },
      update: { $set: { sortOrder: index } },
    },
  }));

  if (bulkOps.length > 0) {
    await SubjectModel.bulkWrite(bulkOps);
  }
}

// ─── Increment Question Count ───────────────────────────────────────────────

export async function incrementQuestionCount(
  subjectId: string,
  delta: number
): Promise<void> {
  await SubjectModel.updateOne(
    { _id: toObjectId(subjectId) },
    { $inc: { questionCount: delta } }
  );
}
