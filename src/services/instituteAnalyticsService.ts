import mongoose, { Types } from "mongoose";
import { TestAttemptModel } from "../models/testAttempt";
import { QuestionModel } from "../models/question";
import { StudentAnalyticsSnapshotModel } from "../models/studentAnalyticsSnapshot";
import { PurchaseModel } from "../models/purchase";
import { computeInstituteAnalytics } from "./analyticsComputationService";

const Membership =
  mongoose.models.Membership ||
  mongoose.model("Membership", new mongoose.Schema({}, { strict: false }));
const Class =
  mongoose.models.Class ||
  mongoose.model("Class", new mongoose.Schema({}, { strict: false }));
const OnlineTest =
  mongoose.models.OnlineTest ||
  mongoose.model("OnlineTest", new mongoose.Schema({}, { strict: false }));

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── getInstituteOverview ───────────────────────────────────────────────────

export async function getInstituteOverview(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string }
) {
  const companyOid = toObjectId(companyId);

  const totalStudents = await Membership.countDocuments({
    companyId: companyOid,
    role: "student",
  });

  const totalTeachers = await Membership.countDocuments({
    companyId: companyOid,
    role: { $in: ["teacher", "senior_teacher"] },
  });

  const totalClasses = await Class.countDocuments({
    companyId: companyOid,
    status: "active",
  });

  const totalTests = await OnlineTest.countDocuments({
    companyId: companyOid,
  });

  const totalQuestions = await QuestionModel.countDocuments({
    companyId: companyOid,
    isArchived: { $ne: true },
  });

  // Average student score from snapshots
  const snapshots = await StudentAnalyticsSnapshotModel.find({
    companyId: companyOid,
    period: "all_time",
  })
    .select("overallStats.averagePercentage")
    .lean();

  const avgs = snapshots.map(
    (s) => s.overallStats?.averagePercentage || 0
  );
  const averageStudentScore =
    avgs.length > 0
      ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10
      : 0;

  // Active students in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activeStudentsLast30Days = await TestAttemptModel.distinct(
    "studentId",
    {
      companyId: companyOid,
      createdAt: { $gte: thirtyDaysAgo },
    }
  ).then((ids) => ids.length);

  // New students this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newStudentsThisMonth = await Membership.countDocuments({
    companyId: companyOid,
    role: "student",
    createdAt: { $gte: monthStart },
  });

  // Retention rate
  const retentionRate =
    totalStudents > 0
      ? Math.round((activeStudentsLast30Days / totalStudents) * 100)
      : 0;

  return {
    totalStudents,
    totalTeachers,
    totalClasses,
    totalTests,
    totalQuestions,
    averageStudentScore,
    activeStudentsLast30Days,
    newStudentsThisMonth,
    retentionRate,
  };
}

// ─── getEnrollmentTrends ────────────────────────────────────────────────────

export async function getEnrollmentTrends(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string },
  granularity?: string
) {
  const analytics = await computeInstituteAnalytics(companyId, dateRange);
  return analytics.enrollmentTrends;
}

// ─── getTeacherActivity ─────────────────────────────────────────────────────

export async function getTeacherActivity(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string }
) {
  const analytics = await computeInstituteAnalytics(companyId, dateRange);
  return analytics.teacherActivity;
}

// ─── getContentUsage ────────────────────────────────────────────────────────

export async function getContentUsage(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string },
  limit = 20
) {
  const analytics = await computeInstituteAnalytics(companyId, dateRange);
  return analytics.contentUsage.slice(0, limit);
}

// ─── getStudentRetention ────────────────────────────────────────────────────

export async function getStudentRetention(
  companyId: string,
  dateRange?: { startDate?: string; endDate?: string }
) {
  const analytics = await computeInstituteAnalytics(companyId, dateRange);
  return analytics.studentRetention;
}

// ─── getQuestionBankStats ───────────────────────────────────────────────────

export async function getQuestionBankStats(companyId: string) {
  const analytics = await computeInstituteAnalytics(companyId);
  return analytics.questionBankStats;
}
