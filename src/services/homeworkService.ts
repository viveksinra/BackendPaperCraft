import path from "path";
import mongoose from "mongoose";
import { HomeworkModel, HomeworkDocument } from "../models/homework";
import { HomeworkSubmissionModel, HomeworkSubmissionDocument } from "../models/homeworkSubmission";
import { ClassModel } from "../models/class";
import { OnlineTestModel } from "../models/onlineTest";
import { QuestionModel } from "../models/question";
import { TestAttemptModel } from "../models/testAttempt";

const User = require(path.join(__dirname, "..", "..", "Models", "User"));

// ─── Helpers ────────────────────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

// ─── 1. Create Homework ────────────────────────────────────────────────────

export async function createHomework(
  companyId: string,
  tenantId: string,
  input: Record<string, unknown>,
  creatorEmail: string
): Promise<HomeworkDocument> {
  const companyOid = toObjectId(companyId);
  const classId = toObjectId(input.classId as string);

  // Validate class exists
  const cls = await ClassModel.findOne({ _id: classId, companyId: companyOid });
  if (!cls) {
    throw Object.assign(new Error("Class not found"), { status: 404 });
  }

  // Calculate total marks based on type
  let totalMarks = 0;
  const type = input.type as string;

  if (type === "test" && input.testId) {
    const test = await OnlineTestModel.findById(toObjectId(input.testId as string));
    if (!test) {
      throw Object.assign(new Error("Test not found"), { status: 404 });
    }
    totalMarks = test.totalMarks || 0;
  } else if (type === "questions" && Array.isArray(input.questionIds)) {
    const questionOids = (input.questionIds as string[]).map((id) => toObjectId(id));
    const questions = await QuestionModel.find({ _id: { $in: questionOids } });
    totalMarks = questions.reduce((sum: number, q: any) => sum + (q.marks || 1), 0);
  }

  const homework = await HomeworkModel.create({
    tenantId,
    companyId: companyOid,
    classId,
    title: input.title,
    description: (input.description as string) || "",
    type,
    testId: input.testId ? toObjectId(input.testId as string) : null,
    questionIds: Array.isArray(input.questionIds)
      ? (input.questionIds as string[]).map((id) => toObjectId(id))
      : [],
    totalMarks,
    assignedAt: new Date(),
    dueDate: new Date(input.dueDate as string),
    lateSubmissionAllowed: Boolean(input.lateSubmissionAllowed),
    lateDeadline: input.lateDeadline ? new Date(input.lateDeadline as string) : null,
    status: "active",
    submissionSummary: {
      total: cls.students.length,
      completed: 0,
      pending: cls.students.length,
      overdue: 0,
      late: 0,
    },
    createdBy: creatorEmail.toLowerCase(),
    updatedBy: creatorEmail.toLowerCase(),
  });

  // Bulk-create submission records for all class students
  if (cls.students.length > 0) {
    const submissionOps = cls.students.map((studentUserId: any) => ({
      insertOne: {
        document: {
          tenantId,
          companyId: companyOid,
          homeworkId: homework._id,
          studentUserId,
          status: "pending",
          totalMarks,
        },
      },
    }));

    await HomeworkSubmissionModel.bulkWrite(submissionOps, { ordered: false }).catch(() => {});
  }

  return homework;
}

// ─── 2. List Homework ──────────────────────────────────────────────────────

interface HomeworkFilters {
  classId?: string;
  status?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

interface PaginationOpts {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listHomework(
  companyId: string,
  filters?: HomeworkFilters,
  pagination?: PaginationOpts
): Promise<{ items: HomeworkDocument[]; total: number }> {
  const query: Record<string, unknown> = { companyId: toObjectId(companyId) };

  if (filters?.classId) query.classId = toObjectId(filters.classId);
  if (filters?.status) query.status = filters.status;
  if (filters?.dueDateFrom || filters?.dueDateTo) {
    const dueDateFilter: Record<string, Date> = {};
    if (filters.dueDateFrom) dueDateFilter.$gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) dueDateFilter.$lte = new Date(filters.dueDateTo);
    query.dueDate = dueDateFilter;
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const sortBy = pagination?.sortBy || "dueDate";
  const sortDir = pagination?.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    HomeworkModel.find(query)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("classId", "name")
      .lean(),
    HomeworkModel.countDocuments(query),
  ]);

  return { items: items as unknown as HomeworkDocument[], total };
}

// ─── 3. Get Homework ────────────────────────────────────────────────────────

export async function getHomework(
  companyId: string,
  homeworkId: string
): Promise<HomeworkDocument> {
  const doc = await HomeworkModel.findOne({
    _id: toObjectId(homeworkId),
    companyId: toObjectId(companyId),
  }).populate("classId", "name studentCount");

  if (!doc) {
    throw Object.assign(new Error("Homework not found"), { status: 404 });
  }
  return doc;
}

// ─── 4. Update Homework ────────────────────────────────────────────────────

export async function updateHomework(
  companyId: string,
  homeworkId: string,
  input: Record<string, unknown>,
  updaterEmail: string
): Promise<HomeworkDocument> {
  const doc = await HomeworkModel.findOne({
    _id: toObjectId(homeworkId),
    companyId: toObjectId(companyId),
  });

  if (!doc) {
    throw Object.assign(new Error("Homework not found"), { status: 404 });
  }

  if (input.title !== undefined) doc.title = input.title as string;
  if (input.description !== undefined) doc.description = input.description as string;
  if (input.dueDate !== undefined) doc.dueDate = new Date(input.dueDate as string);
  if (input.lateSubmissionAllowed !== undefined)
    doc.lateSubmissionAllowed = input.lateSubmissionAllowed as boolean;
  if (input.lateDeadline !== undefined)
    doc.lateDeadline = input.lateDeadline ? new Date(input.lateDeadline as string) : null;

  doc.updatedBy = updaterEmail.toLowerCase();
  await doc.save();
  return doc;
}

// ─── 5. Delete (Archive) Homework ──────────────────────────────────────────

export async function deleteHomework(
  companyId: string,
  homeworkId: string
): Promise<HomeworkDocument> {
  const doc = await HomeworkModel.findOne({
    _id: toObjectId(homeworkId),
    companyId: toObjectId(companyId),
  });

  if (!doc) {
    throw Object.assign(new Error("Homework not found"), { status: 404 });
  }

  doc.status = "archived";
  await doc.save();
  return doc;
}

// ─── 6. Get Homework Submissions ────────────────────────────────────────────

export async function getHomeworkSubmissions(
  companyId: string,
  homeworkId: string,
  filters?: { status?: string },
  pagination?: PaginationOpts
): Promise<{ items: any[]; total: number }> {
  const query: Record<string, unknown> = {
    homeworkId: toObjectId(homeworkId),
    companyId: toObjectId(companyId),
  };

  if (filters?.status) query.status = filters.status;

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;

  const [items, total] = await Promise.all([
    HomeworkSubmissionModel.find(query)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    HomeworkSubmissionModel.countDocuments(query),
  ]);

  // Enrich with student names
  const studentIds = items.map((s: any) => s.studentUserId);
  const users = await User.find({ _id: { $in: studentIds } }, "name email").lean();
  const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

  const enriched = items.map((s: any) => ({
    ...s,
    studentName: (userMap.get(s.studentUserId.toString()) as any)?.name || "Unknown",
    studentEmail: (userMap.get(s.studentUserId.toString()) as any)?.email || "",
  }));

  return { items: enriched, total };
}

// ─── 7. Submit Homework ────────────────────────────────────────────────────

export async function submitHomework(
  studentUserId: string,
  homeworkId: string,
  answers: Array<{ questionId: string; answer: unknown }>
): Promise<HomeworkSubmissionDocument> {
  const hwOid = toObjectId(homeworkId);
  const studentOid = toObjectId(studentUserId);

  const homework = await HomeworkModel.findById(hwOid);
  if (!homework) {
    throw Object.assign(new Error("Homework not found"), { status: 404 });
  }

  if (homework.status === "archived") {
    throw Object.assign(new Error("Homework is archived"), { status: 400 });
  }

  const submission = await HomeworkSubmissionModel.findOne({
    homeworkId: hwOid,
    studentUserId: studentOid,
  });

  if (!submission) {
    throw Object.assign(new Error("Submission record not found"), { status: 404 });
  }

  if (submission.status === "graded" || submission.status === "submitted") {
    throw Object.assign(new Error("Already submitted"), { status: 400 });
  }

  const now = new Date();
  const dueDate = homework.dueDate;
  const lateDeadline = homework.lateDeadline;

  // Check if past all deadlines
  if (lateDeadline && now > lateDeadline) {
    throw Object.assign(new Error("Submission deadline has passed"), { status: 400 });
  }
  if (!homework.lateSubmissionAllowed && now > dueDate) {
    throw Object.assign(new Error("Submission deadline has passed"), { status: 400 });
  }

  const isLate = now > dueDate;

  // Process answers
  if (homework.type === "questions") {
    const questions = await QuestionModel.find({
      _id: { $in: homework.questionIds },
    }).lean();

    const questionMap = new Map(questions.map((q: any) => [q._id.toString(), q]));

    let totalScore = 0;
    const processedAnswers = answers.map((a) => {
      const q = questionMap.get(a.questionId);
      const maxMarks = q?.marks || 1;
      // Auto-grade objective types
      let isCorrect: boolean | null = null;
      let marksAwarded = 0;

      if (q) {
        const qType = q.questionType || q.type;
        if (["mcq", "true_false", "fill_in_blank", "numerical"].includes(qType)) {
          const correctAnswer = q.correctAnswer || q.answer;
          if (correctAnswer !== undefined) {
            isCorrect = String(a.answer).toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();
            marksAwarded = isCorrect ? maxMarks : 0;
          }
        }
      }

      totalScore += marksAwarded;

      return {
        questionId: toObjectId(a.questionId),
        answer: a.answer,
        isCorrect,
        marksAwarded,
        maxMarks,
      };
    });

    submission.answers = processedAnswers as any;
    submission.score = totalScore;
    submission.totalMarks = homework.totalMarks;
    submission.percentage =
      homework.totalMarks > 0
        ? Math.round((totalScore / homework.totalMarks) * 1000) / 10
        : 0;
  }

  submission.status = isLate ? "late" : "submitted";
  submission.submittedAt = now;
  await submission.save();

  // Update homework submission summary
  const updateOps: Record<string, number> = {
    "submissionSummary.pending": -1,
  };
  if (isLate) {
    updateOps["submissionSummary.late"] = 1;
  }
  updateOps["submissionSummary.completed"] = 1;

  await HomeworkModel.updateOne(
    { _id: hwOid },
    { $inc: updateOps }
  );

  return submission;
}

// ─── 8. Get Student Homework ────────────────────────────────────────────────

export async function getStudentHomework(
  studentUserId: string,
  filters?: { status?: string; classId?: string },
  pagination?: PaginationOpts
): Promise<{ items: any[]; total: number }> {
  const studentOid = toObjectId(studentUserId);

  const subQuery: Record<string, unknown> = { studentUserId: studentOid };
  if (filters?.status) subQuery.status = filters.status;

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;

  const [submissions, total] = await Promise.all([
    HomeworkSubmissionModel.find(subQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    HomeworkSubmissionModel.countDocuments(subQuery),
  ]);

  // Enrich with homework details
  const homeworkIds = submissions.map((s: any) => s.homeworkId);
  const homeworks = await HomeworkModel.find({ _id: { $in: homeworkIds } })
    .populate("classId", "name")
    .lean();
  const hwMap = new Map(homeworks.map((h: any) => [h._id.toString(), h]));

  const items = submissions.map((s: any) => {
    const hw = hwMap.get(s.homeworkId.toString());
    return {
      ...s,
      homework: hw
        ? {
            title: hw.title,
            type: hw.type,
            dueDate: hw.dueDate,
            lateSubmissionAllowed: hw.lateSubmissionAllowed,
            lateDeadline: hw.lateDeadline,
            className: (hw.classId as any)?.name || "",
            status: hw.status,
          }
        : null,
    };
  });

  return { items, total };
}

// ─── 9. Get Student Homework Detail ─────────────────────────────────────────

export async function getStudentHomeworkDetail(
  studentUserId: string,
  homeworkId: string
): Promise<{ homework: HomeworkDocument; submission: HomeworkSubmissionDocument }> {
  const hwOid = toObjectId(homeworkId);
  const studentOid = toObjectId(studentUserId);

  const homework = await HomeworkModel.findById(hwOid)
    .populate("classId", "name")
    .populate("questionIds");

  if (!homework) {
    throw Object.assign(new Error("Homework not found"), { status: 404 });
  }

  const submission = await HomeworkSubmissionModel.findOne({
    homeworkId: hwOid,
    studentUserId: studentOid,
  });

  if (!submission) {
    throw Object.assign(new Error("Submission not found"), { status: 404 });
  }

  return { homework, submission };
}

// ─── 10. Grade Homework Submission ──────────────────────────────────────────

export async function gradeHomeworkSubmission(
  companyId: string,
  homeworkId: string,
  studentUserId: string,
  grades: Array<{ questionId: string; marksAwarded: number; isCorrect: boolean }>,
  feedback: string | undefined,
  graderEmail: string
): Promise<HomeworkSubmissionDocument> {
  const submission = await HomeworkSubmissionModel.findOne({
    homeworkId: toObjectId(homeworkId),
    studentUserId: toObjectId(studentUserId),
    companyId: toObjectId(companyId),
  });

  if (!submission) {
    throw Object.assign(new Error("Submission not found"), { status: 404 });
  }

  // Apply grades
  for (const grade of grades) {
    const answer = submission.answers.find(
      (a: any) => a.questionId.toString() === grade.questionId
    );
    if (answer) {
      (answer as any).marksAwarded = grade.marksAwarded;
      (answer as any).isCorrect = grade.isCorrect;
    }
  }

  // Recalculate total score
  const totalScore = submission.answers.reduce(
    (sum: number, a: any) => sum + (a.marksAwarded || 0),
    0
  );

  submission.score = totalScore;
  submission.percentage =
    submission.totalMarks > 0
      ? Math.round((totalScore / submission.totalMarks) * 1000) / 10
      : 0;
  submission.status = "graded";
  submission.gradedAt = new Date();
  submission.gradedBy = graderEmail.toLowerCase();
  if (feedback !== undefined) submission.feedback = feedback;

  await submission.save();
  return submission;
}

// ─── 11. Update Homework Statuses (Scheduled Job) ──────────────────────────

export async function updateHomeworkStatuses(): Promise<{
  transitioned: number;
  notified: number;
}> {
  const now = new Date();

  // Find active homework past due date
  const overdueHomework = await HomeworkModel.find({
    status: "active",
    dueDate: { $lt: now },
  });

  let transitioned = 0;
  for (const hw of overdueHomework) {
    // If late submission is allowed and late deadline hasn't passed, keep active
    if (hw.lateSubmissionAllowed && hw.lateDeadline && hw.lateDeadline > now) {
      continue;
    }

    hw.status = "past_due";
    await hw.save();

    // Update pending submissions to overdue
    const result = await HomeworkSubmissionModel.updateMany(
      { homeworkId: hw._id, status: "pending" },
      { $set: { status: "submitted" } }
    );

    if (result.modifiedCount > 0) {
      await HomeworkModel.updateOne(
        { _id: hw._id },
        {
          $inc: {
            "submissionSummary.overdue": result.modifiedCount,
            "submissionSummary.pending": -result.modifiedCount,
          },
        }
      );
    }

    transitioned++;
  }

  // Find homework due tomorrow for notifications
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const dueSoonHomework = await HomeworkModel.find({
    status: "active",
    dueDate: { $gte: tomorrow, $lt: dayAfterTomorrow },
  });

  let notified = 0;
  for (const hw of dueSoonHomework) {
    const pendingStudents = await HomeworkSubmissionModel.find({
      homeworkId: hw._id,
      status: "pending",
    });
    notified += pendingStudents.length;
    // Notification queuing would happen here via BullMQ
  }

  return { transitioned, notified };
}
