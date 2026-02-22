import path from "path";
import mongoose from "mongoose";
import { ClassModel, ClassDocument } from "../models/class";
import { FeeRecordModel } from "../models/feeRecord";
import { HomeworkModel } from "../models/homework";
import { HomeworkSubmissionModel } from "../models/homeworkSubmission";
import { TestAttemptModel } from "../models/testAttempt";

const User = require(path.join(__dirname, "..", "..", "Models", "User"));
const Membership = require(path.join(__dirname, "..", "..", "Models", "Membership"));

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ─── 1. Create Class ────────────────────────────────────────────────────────

export async function createClass(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  creatorEmail: string
): Promise<ClassDocument> {
  const companyOid = toObjectId(companyId);
  const baseName = input.name as string;
  let slug = generateSlug(baseName);

  // Check slug uniqueness within company
  let slugExists = await ClassModel.findOne({ companyId: companyOid, slug });
  let counter = 1;
  while (slugExists) {
    slug = `${generateSlug(baseName)}-${counter}`;
    slugExists = await ClassModel.findOne({ companyId: companyOid, slug });
    counter++;
  }

  // Resolve creator user ID
  const creator = await User.findOne({ email: creatorEmail.toLowerCase() });
  if (!creator) {
    throw Object.assign(new Error("Creator user not found"), { status: 404 });
  }

  const doc = await ClassModel.create({
    tenantId,
    companyId: companyOid,
    name: baseName,
    slug,
    description: (input.description as string) || "",
    yearGroup: (input.yearGroup as string) || "",
    subject: (input.subject as string) || "",
    schedule: input.schedule || { dayOfWeek: [], time: "", location: "" },
    students: [],
    teachers: [creator._id],
    studentCount: 0,
    status: "active",
    createdBy: creatorEmail.toLowerCase(),
    updatedBy: creatorEmail.toLowerCase(),
  });

  return doc;
}

// ─── 2. List Classes ────────────────────────────────────────────────────────

interface ClassFilters {
  status?: string;
  yearGroup?: string;
  subject?: string;
  teacherId?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listClasses(
  companyId: string,
  tenantId: string,
  filters?: ClassFilters,
  pagination?: PaginationOpts
): Promise<{ items: ClassDocument[]; total: number }> {
  const query: Record<string, unknown> = { companyId: toObjectId(companyId) };

  if (filters?.status) query.status = filters.status;
  if (filters?.yearGroup) query.yearGroup = filters.yearGroup;
  if (filters?.subject) query.subject = filters.subject;
  if (filters?.teacherId) query.teachers = toObjectId(filters.teacherId);

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const sortBy = pagination?.sortBy || "createdAt";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    ClassModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("teachers", "name email")
      .lean(),
    ClassModel.countDocuments(query),
  ]);

  return { items: items as unknown as ClassDocument[], total };
}

// ─── 3. Get Class ───────────────────────────────────────────────────────────

export async function getClass(
  companyId: string,
  classId: string
): Promise<ClassDocument> {
  const doc = await ClassModel.findOne({
    _id: toObjectId(classId),
    companyId: toObjectId(companyId),
  })
    .populate("students", "name email")
    .populate("teachers", "name email");

  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }
  return doc;
}

// ─── 4. Update Class ────────────────────────────────────────────────────────

export async function updateClass(
  companyId: string,
  classId: string,
  input: Record<string, unknown>,
  updaterEmail: string
): Promise<ClassDocument> {
  const companyOid = toObjectId(companyId);
  const doc = await ClassModel.findOne({
    _id: toObjectId(classId),
    companyId: companyOid,
  });

  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  if (input.name && input.name !== doc.name) {
    let slug = generateSlug(input.name as string);
    let slugExists = await ClassModel.findOne({
      companyId: companyOid,
      slug,
      _id: { $ne: doc._id },
    });
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(input.name as string)}-${counter}`;
      slugExists = await ClassModel.findOne({
        companyId: companyOid,
        slug,
        _id: { $ne: doc._id },
      });
      counter++;
    }
    doc.slug = slug;
    doc.name = input.name as string;
  }

  if (input.description !== undefined) doc.description = input.description as string;
  if (input.yearGroup !== undefined) doc.yearGroup = input.yearGroup as string;
  if (input.subject !== undefined) doc.subject = input.subject as string;
  if (input.schedule !== undefined) doc.schedule = input.schedule as any;

  if (input.status === "archived" && doc.status !== "archived") {
    doc.status = "archived";
    doc.archivedAt = new Date();
  } else if (input.status === "active") {
    doc.status = "active";
    doc.archivedAt = null;
  }

  doc.updatedBy = updaterEmail.toLowerCase();
  await doc.save();
  return doc;
}

// ─── 5. Delete (Archive) Class ──────────────────────────────────────────────

export async function deleteClass(
  companyId: string,
  classId: string
): Promise<ClassDocument> {
  const doc = await ClassModel.findOne({
    _id: toObjectId(classId),
    companyId: toObjectId(companyId),
  });

  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  doc.status = "archived";
  doc.archivedAt = new Date();
  await doc.save();
  return doc;
}

// ─── 6. Add Students ────────────────────────────────────────────────────────

export async function addStudents(
  companyId: string,
  classId: string,
  studentUserIds: string[],
  creatorEmail: string
): Promise<ClassDocument> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const doc = await ClassModel.findOne({ _id: classOid, companyId: companyOid });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  // Validate students are org members with student role
  const studentOids = studentUserIds.map((id) => toObjectId(id));
  const validMemberships = await Membership.find({
    userId: { $in: studentOids },
    companyId: companyOid,
    role: "student",
  });

  const validStudentIds = validMemberships.map((m: any) => m.userId.toString());
  const existingStudentIds = new Set(doc.students.map((s: any) => s.toString()));
  const newStudentIds = validStudentIds.filter(
    (id: string) => !existingStudentIds.has(id)
  );

  if (newStudentIds.length === 0) {
    return doc;
  }

  // Add to class
  await ClassModel.updateOne(
    { _id: classOid },
    {
      $addToSet: { students: { $each: newStudentIds.map((id: string) => toObjectId(id)) } },
      $inc: { studentCount: newStudentIds.length },
      $set: { updatedBy: creatorEmail.toLowerCase() },
    }
  );

  // Create FeeRecord for each new student
  const feeOps = newStudentIds.map((studentUserId: string) => ({
    insertOne: {
      document: {
        tenantId: doc.tenantId,
        companyId: companyOid,
        classId: classOid,
        studentUserId: toObjectId(studentUserId),
        amount: 0,
        currency: "GBP",
        amountPaid: 0,
        status: "unpaid",
        createdBy: creatorEmail.toLowerCase(),
        updatedBy: creatorEmail.toLowerCase(),
      },
    },
  }));

  if (feeOps.length > 0) {
    await FeeRecordModel.bulkWrite(feeOps, { ordered: false }).catch(() => {
      // Ignore duplicate key errors for fee records
    });
  }

  // Create HomeworkSubmission records for active homework
  const activeHomework = await HomeworkModel.find({
    classId: classOid,
    status: "active",
  });

  if (activeHomework.length > 0) {
    const submissionOps: any[] = [];
    for (const hw of activeHomework) {
      for (const studentUserId of newStudentIds) {
        submissionOps.push({
          insertOne: {
            document: {
              tenantId: doc.tenantId,
              companyId: companyOid,
              homeworkId: hw._id,
              studentUserId: toObjectId(studentUserId),
              status: "pending",
              totalMarks: hw.totalMarks,
            },
          },
        });
      }
    }
    if (submissionOps.length > 0) {
      await HomeworkSubmissionModel.bulkWrite(submissionOps, {
        ordered: false,
      }).catch(() => {});

      // Update submission summary for each homework
      for (const hw of activeHomework) {
        await HomeworkModel.updateOne(
          { _id: hw._id },
          {
            $inc: {
              "submissionSummary.total": newStudentIds.length,
              "submissionSummary.pending": newStudentIds.length,
            },
          }
        );
      }
    }
  }

  const updated = await ClassModel.findById(classOid);
  return updated!;
}

// ─── 7. Remove Student ──────────────────────────────────────────────────────

export async function removeStudent(
  companyId: string,
  classId: string,
  studentUserId: string,
  updaterEmail: string
): Promise<ClassDocument> {
  const classOid = toObjectId(classId);
  const studentOid = toObjectId(studentUserId);

  const doc = await ClassModel.findOne({
    _id: classOid,
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  const wasInClass = doc.students.some(
    (s: any) => s.toString() === studentUserId
  );

  if (wasInClass) {
    await ClassModel.updateOne(
      { _id: classOid },
      {
        $pull: { students: studentOid },
        $inc: { studentCount: -1 },
        $set: { updatedBy: updaterEmail.toLowerCase() },
      }
    );
  }

  const updated = await ClassModel.findById(classOid);
  return updated!;
}

// ─── 8. Add Teacher ─────────────────────────────────────────────────────────

export async function addTeacher(
  companyId: string,
  classId: string,
  teacherUserId: string,
  updaterEmail: string
): Promise<ClassDocument> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);
  const teacherOid = toObjectId(teacherUserId);

  const doc = await ClassModel.findOne({ _id: classOid, companyId: companyOid });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  // Validate teacher has appropriate role
  const membership = await Membership.findOne({
    userId: teacherOid,
    companyId: companyOid,
    role: { $in: ["teacher", "senior_teacher", "admin", "owner"] },
  });

  if (!membership) {
    throw Object.assign(
      new Error("User does not have a teacher role in this organisation"),
      { status: 400 }
    );
  }

  await ClassModel.updateOne(
    { _id: classOid },
    {
      $addToSet: { teachers: teacherOid },
      $set: { updatedBy: updaterEmail.toLowerCase() },
    }
  );

  const updated = await ClassModel.findById(classOid);
  return updated!;
}

// ─── 9. Remove Teacher ──────────────────────────────────────────────────────

export async function removeTeacher(
  companyId: string,
  classId: string,
  teacherUserId: string,
  updaterEmail: string
): Promise<ClassDocument> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const doc = await ClassModel.findOne({ _id: classOid, companyId: companyOid });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  if (doc.teachers.length <= 1) {
    throw Object.assign(
      new Error("Cannot remove the last teacher from a class"),
      { status: 400 }
    );
  }

  await ClassModel.updateOne(
    { _id: classOid },
    {
      $pull: { teachers: toObjectId(teacherUserId) },
      $set: { updatedBy: updaterEmail.toLowerCase() },
    }
  );

  const updated = await ClassModel.findById(classOid);
  return updated!;
}

// ─── 10. Get Class Students ─────────────────────────────────────────────────

export async function getClassStudents(
  companyId: string,
  classId: string,
  pagination?: PaginationOpts
): Promise<{ items: any[]; total: number }> {
  const companyOid = toObjectId(companyId);
  const classOid = toObjectId(classId);

  const doc = await ClassModel.findOne({
    _id: classOid,
    companyId: companyOid,
  });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const start = (page - 1) * limit;
  const end = start + limit;

  const studentIds = doc.students.slice(start, end);

  const students = await User.find(
    { _id: { $in: studentIds } },
    "name email"
  ).lean();

  // Get fee status for each student
  const feeRecords = await FeeRecordModel.find({
    classId: classOid,
    studentUserId: { $in: studentIds },
  }).lean();

  const feeMap = new Map(
    feeRecords.map((f: any) => [f.studentUserId.toString(), f])
  );

  const enriched = students.map((s: any) => ({
    ...s,
    feeStatus: feeMap.get(s._id.toString())?.status || "unpaid",
  }));

  return { items: enriched, total: doc.students.length };
}

// ─── 11. Get Class Performance ──────────────────────────────────────────────

export async function getClassPerformance(
  companyId: string,
  classId: string
): Promise<Record<string, unknown>> {
  const classOid = toObjectId(classId);

  const doc = await ClassModel.findOne({
    _id: classOid,
    companyId: toObjectId(companyId),
  });
  if (!doc) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  // Aggregate test results for class students
  const attempts = await TestAttemptModel.find({
    studentUserId: { $in: doc.students },
    status: "completed",
  })
    .sort({ completedAt: -1 })
    .limit(200)
    .lean();

  const scores = attempts
    .filter((a: any) => a.result?.percentage != null)
    .map((a: any) => a.result.percentage);

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  return {
    averageScore: avgScore,
    totalTestsTaken: attempts.length,
    studentCount: doc.studentCount,
  };
}

// ─── 12. Get Student Classes ────────────────────────────────────────────────

export async function getStudentClasses(
  companyId: string,
  studentUserId: string
): Promise<ClassDocument[]> {
  return ClassModel.find({
    companyId: toObjectId(companyId),
    students: toObjectId(studentUserId),
    status: "active",
  })
    .populate("teachers", "name email")
    .lean() as unknown as Promise<ClassDocument[]>;
}
