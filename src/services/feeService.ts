import path from "path";
import mongoose from "mongoose";
import { FeeRecordModel, FeeRecordDocument } from "../models/feeRecord";
import { ClassModel } from "../models/class";
import { ParentLinkModel } from "../models/parentLink";

const User = require(path.join(__dirname, "..", "..", "Models", "User"));

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

function calculateFeeStatus(
  amount: number,
  amountPaid: number
): "unpaid" | "partial" | "paid" {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid >= amount) return "paid";
  return "partial";
}

// ─── 1. Get Class Fees ──────────────────────────────────────────────────────

interface FeeFilters {
  status?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
}

export async function getClassFees(
  companyId: string,
  classId: string,
  filters?: FeeFilters,
  pagination?: PaginationOpts
): Promise<{
  items: any[];
  total: number;
  summary: {
    totalStudents: number;
    paidCount: number;
    unpaidCount: number;
    partialCount: number;
    totalRevenue: number;
    totalOutstanding: number;
  };
}> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const query: Record<string, unknown> = {
    companyId: companyOid,
    classId: classOid,
  };
  if (filters?.status) query.status = filters.status;

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;

  const [items, total] = await Promise.all([
    FeeRecordModel.find(query)
      .sort({ status: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    FeeRecordModel.countDocuments(query),
  ]);

  // Enrich with student names
  const studentIds = items.map((f: any) => f.studentUserId);
  const users = await User.find({ _id: { $in: studentIds } }, "name email").lean();
  const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

  const enriched = items.map((f: any) => ({
    ...f,
    studentName: (userMap.get(f.studentUserId.toString()) as any)?.name || "Unknown",
    studentEmail: (userMap.get(f.studentUserId.toString()) as any)?.email || "",
  }));

  // Calculate summary
  const allFees = await FeeRecordModel.find({
    companyId: companyOid,
    classId: classOid,
  }).lean();

  const summary = {
    totalStudents: allFees.length,
    paidCount: allFees.filter((f: any) => f.status === "paid").length,
    unpaidCount: allFees.filter((f: any) => f.status === "unpaid").length,
    partialCount: allFees.filter((f: any) => f.status === "partial").length,
    totalRevenue: allFees.reduce((sum: number, f: any) => sum + (f.amountPaid || 0), 0),
    totalOutstanding: allFees.reduce(
      (sum: number, f: any) => sum + Math.max(0, (f.amount || 0) - (f.amountPaid || 0)),
      0
    ),
  };

  return { items: enriched, total, summary };
}

// ─── 2. Update Fee Status ───────────────────────────────────────────────────

export async function updateFeeStatus(
  companyId: string,
  classId: string,
  studentUserId: string,
  input: Record<string, unknown>,
  updaterEmail: string
): Promise<FeeRecordDocument> {
  const doc = await FeeRecordModel.findOne({
    companyId: toObjectId(companyId),
    classId: toObjectId(classId),
    studentUserId: toObjectId(studentUserId),
  });

  if (!doc) {
    throw Object.assign(new Error("Fee record not found"), { status: 404 });
  }

  if (input.amount !== undefined) doc.amount = input.amount as number;
  if (input.amountPaid !== undefined) doc.amountPaid = input.amountPaid as number;
  if (input.notes !== undefined) doc.notes = input.notes as string;
  if (input.dueDate !== undefined) doc.dueDate = input.dueDate ? new Date(input.dueDate as string) : null;

  // Auto-calculate status
  doc.status = calculateFeeStatus(doc.amount, doc.amountPaid);

  if (doc.status === "paid" && !doc.paidAt) {
    doc.paidAt = new Date();
  } else if (doc.status !== "paid") {
    doc.paidAt = null;
  }

  doc.updatedBy = updaterEmail.toLowerCase();
  await doc.save();
  return doc;
}

// ─── 3. Bulk Update Fees ────────────────────────────────────────────────────

export async function bulkUpdateFees(
  companyId: string,
  classId: string,
  input: { amount: number; currency?: string; dueDate?: string },
  updaterEmail: string
): Promise<{ modifiedCount: number }> {
  const updateFields: Record<string, unknown> = {
    amount: input.amount,
    updatedBy: updaterEmail.toLowerCase(),
  };

  if (input.currency) updateFields.currency = input.currency;
  if (input.dueDate) updateFields.dueDate = new Date(input.dueDate);

  const result = await FeeRecordModel.updateMany(
    {
      companyId: toObjectId(companyId),
      classId: toObjectId(classId),
    },
    { $set: updateFields }
  );

  return { modifiedCount: result.modifiedCount };
}

// ─── 4. Send Fee Reminder ───────────────────────────────────────────────────

export async function sendFeeReminder(
  companyId: string,
  classId: string,
  studentUserIds: string[] | undefined,
  updaterEmail: string
): Promise<{ sentCount: number }> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  let query: Record<string, unknown> = {
    companyId: companyOid,
    classId: classOid,
  };

  if (studentUserIds && studentUserIds.length > 0) {
    query.studentUserId = { $in: studentUserIds.map((id) => toObjectId(id)) };
  } else {
    query.status = { $in: ["unpaid", "partial"] };
  }

  const feeRecords = await FeeRecordModel.find(query).lean();

  // Get student and parent info for sending emails
  const studentIds = feeRecords.map((f: any) => f.studentUserId);
  const students = await User.find({ _id: { $in: studentIds } }, "name email").lean();
  const parentLinks = await ParentLinkModel.find({
    studentUserId: { $in: studentIds },
    status: "active",
  }).lean();

  const parentIds = parentLinks.map((l: any) => l.parentUserId);
  const parents = await User.find({ _id: { $in: parentIds } }, "name email").lean();

  // Update reminder tracking
  const now = new Date();
  await FeeRecordModel.updateMany(
    { _id: { $in: feeRecords.map((f: any) => f._id) } },
    {
      $set: { lastReminderSentAt: now },
      $inc: { reminderCount: 1 },
    }
  );

  // In production, email sending would be queued via BullMQ
  const sentCount = students.length + parents.length;

  return { sentCount };
}

// ─── 5. Get Student Fees ────────────────────────────────────────────────────

export async function getStudentFees(
  studentUserId: string,
  companyId: string
): Promise<FeeRecordDocument[]> {
  const fees = await FeeRecordModel.find({
    studentUserId: toObjectId(studentUserId),
    companyId: toObjectId(companyId),
  })
    .populate("classId", "name")
    .lean();

  return fees as unknown as FeeRecordDocument[];
}

// ─── 6. Get Child Fees (Parent) ─────────────────────────────────────────────

export async function getChildFees(
  parentUserId: string,
  childStudentUserId: string
): Promise<FeeRecordDocument[]> {
  // Validate parent link
  const link = await ParentLinkModel.findOne({
    parentUserId: toObjectId(parentUserId),
    studentUserId: toObjectId(childStudentUserId),
    status: "active",
  });

  if (!link) {
    throw Object.assign(
      new Error("Not authorized to access this child's data"),
      { status: 403 }
    );
  }

  const fees = await FeeRecordModel.find({
    studentUserId: toObjectId(childStudentUserId),
  })
    .populate("classId", "name")
    .lean();

  return fees as unknown as FeeRecordDocument[];
}
