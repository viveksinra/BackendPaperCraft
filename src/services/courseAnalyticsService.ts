import mongoose, { Types } from "mongoose";
import { CourseModel } from "../models/course";
import { CourseEnrollmentModel } from "../models/courseEnrollment";
import { logger } from "../shared/logger";

const Purchase =
  mongoose.models.Purchase ||
  mongoose.model("Purchase", new mongoose.Schema({}, { strict: false }));

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

// ─── 1. Get Course Analytics ───────────────────────────────────────────────

export async function getCourseAnalytics(
  tenantId: string,
  companyId: string,
  courseId: string
): Promise<Record<string, unknown>> {
  const companyOid = toObjectId(companyId);
  const courseOid = toObjectId(courseId);

  const course = await CourseModel.findOne({
    _id: courseOid,
    tenantId,
    companyId: companyOid,
  });
  if (!course) {
    throw Object.assign(new Error("Course not found"), { status: 404 });
  }

  // Enrollment counts by status
  const [totalEnrollments, activeEnrollments, completedEnrollments, droppedEnrollments] =
    await Promise.all([
      CourseEnrollmentModel.countDocuments({ courseId: courseOid }),
      CourseEnrollmentModel.countDocuments({ courseId: courseOid, status: "active" }),
      CourseEnrollmentModel.countDocuments({ courseId: courseOid, status: "completed" }),
      CourseEnrollmentModel.countDocuments({ courseId: courseOid, status: "dropped" }),
    ]);

  // Average progress and time
  const progressAgg = await CourseEnrollmentModel.aggregate([
    { $match: { courseId: courseOid } },
    {
      $group: {
        _id: null,
        avgProgress: { $avg: "$progress.percentComplete" },
        avgTimeSpent: { $avg: "$progress.totalTimeSpentSeconds" },
      },
    },
  ]);

  const avgProgress = progressAgg[0]?.avgProgress || 0;
  const avgTimeSpentSeconds = progressAgg[0]?.avgTimeSpent || 0;
  const completionRate = totalEnrollments > 0
    ? Math.round((completedEnrollments / totalEnrollments) * 100)
    : 0;

  // Revenue from purchases
  let totalRevenue = 0;
  if (course.pricing.productId) {
    const revenueAgg = await Purchase.aggregate([
      {
        $match: {
          productId: course.pricing.productId,
          status: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    totalRevenue = revenueAgg[0]?.total || 0;
  }

  // Enrollment trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const enrollmentTrend = await CourseEnrollmentModel.aggregate([
    {
      $match: {
        courseId: courseOid,
        enrolledAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$enrolledAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: "$_id", count: 1, _id: 0 } },
  ]);

  // Completion funnel
  const completionFunnel = buildCompletionFunnel(course, courseOid);

  // Rating distribution
  const ratingDistribution = await CourseEnrollmentModel.aggregate([
    { $match: { courseId: courseOid, review: { $ne: null } } },
    { $group: { _id: "$review.rating", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { stars: "$_id", count: 1, _id: 0 } },
  ]);

  // Recent reviews
  const recentReviews = await CourseEnrollmentModel.find({
    courseId: courseOid,
    review: { $ne: null },
  })
    .select("review studentUserId")
    .sort({ "review.reviewedAt": -1 })
    .limit(10)
    .lean();

  return {
    overview: {
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      droppedEnrollments,
      avgProgress: Math.round(avgProgress),
      avgTimeSpentSeconds: Math.round(avgTimeSpentSeconds),
      completionRate,
      avgRating: course.stats.avgRating,
      totalRevenue,
    },
    enrollmentTrend,
    completionFunnel: await completionFunnel,
    ratingDistribution,
    recentReviews: recentReviews.map((e) => ({
      ...e.review,
      studentUserId: e.studentUserId,
    })),
  };
}

async function buildCompletionFunnel(
  course: InstanceType<typeof CourseModel>,
  courseOid: Types.ObjectId
): Promise<Record<string, unknown>[]> {
  const funnel: Record<string, unknown>[] = [];
  const totalEnrollments = await CourseEnrollmentModel.countDocuments({ courseId: courseOid });

  const sortedSections = [...course.sections].sort((a, b) => a.order - b.order);
  for (const section of sortedSections) {
    const sortedLessons = [...section.lessons].sort((a, b) => a.order - b.order);
    for (const lesson of sortedLessons) {
      const completionCount = await CourseEnrollmentModel.countDocuments({
        courseId: courseOid,
        "progress.completedLessons.lessonId": lesson._id,
      });
      funnel.push({
        lessonId: String(lesson._id),
        lessonTitle: lesson.title,
        sectionTitle: section.title,
        completionCount,
        completionPercentage: totalEnrollments > 0
          ? Math.round((completionCount / totalEnrollments) * 100)
          : 0,
      });
    }
  }

  return funnel;
}

// ─── 2. Get Lesson Analytics ───────────────────────────────────────────────

export async function getLessonAnalytics(
  tenantId: string,
  companyId: string,
  courseId: string,
  lessonId: string
): Promise<Record<string, unknown>> {
  const courseOid = toObjectId(courseId);
  const lessonOid = toObjectId(lessonId);

  const totalEnrollments = await CourseEnrollmentModel.countDocuments({ courseId: courseOid });

  const completionCount = await CourseEnrollmentModel.countDocuments({
    courseId: courseOid,
    "progress.completedLessons.lessonId": lessonOid,
  });

  // Average time spent on this lesson
  const timeAgg = await CourseEnrollmentModel.aggregate([
    { $match: { courseId: courseOid } },
    { $unwind: "$progress.completedLessons" },
    { $match: { "progress.completedLessons.lessonId": lessonOid } },
    {
      $group: {
        _id: null,
        avgTime: { $avg: "$progress.completedLessons.timeSpentSeconds" },
        avgQuizScore: { $avg: "$progress.completedLessons.quizScore" },
      },
    },
  ]);

  const dropOffRate = totalEnrollments > 0
    ? Math.round(((totalEnrollments - completionCount) / totalEnrollments) * 100)
    : 0;

  return {
    lessonId,
    completionCount,
    avgTimeSpentSeconds: Math.round(timeAgg[0]?.avgTime || 0),
    quizAvgScore: timeAgg[0]?.avgQuizScore ?? null,
    dropOffRate,
  };
}

// ─── 3. Get Institute Course Analytics ─────────────────────────────────────

export async function getInstituteCourseAnalytics(
  tenantId: string,
  companyId: string
): Promise<Record<string, unknown>> {
  const companyOid = toObjectId(companyId);

  const [totalCourses, publishedCourses] = await Promise.all([
    CourseModel.countDocuments({ tenantId, companyId: companyOid }),
    CourseModel.countDocuments({ tenantId, companyId: companyOid, status: "published" }),
  ]);

  const [totalEnrollments, totalCompletions] = await Promise.all([
    CourseEnrollmentModel.countDocuments({ tenantId, companyId: companyOid }),
    CourseEnrollmentModel.countDocuments({ tenantId, companyId: companyOid, status: "completed" }),
  ]);

  // Total course revenue
  const courseProducts = await CourseModel.find(
    { tenantId, companyId: companyOid, "pricing.productId": { $ne: null } },
    { "pricing.productId": 1 }
  ).lean();
  const productIds = courseProducts.map(
    (c) => (c as Record<string, unknown>).pricing as Record<string, unknown>
  ).filter((p) => p.productId).map((p) => p.productId);

  let totalCourseRevenue = 0;
  if (productIds.length > 0) {
    const revenueAgg = await Purchase.aggregate([
      { $match: { productId: { $in: productIds }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    totalCourseRevenue = revenueAgg[0]?.total || 0;
  }

  // Top courses by enrollment
  const topCourses = await CourseModel.find(
    { tenantId, companyId: companyOid, status: "published" },
    { title: 1, stats: 1 }
  )
    .sort({ "stats.enrollmentCount": -1 })
    .limit(10)
    .lean();

  // Enrollment trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const enrollmentTrend = await CourseEnrollmentModel.aggregate([
    {
      $match: {
        tenantId,
        companyId: companyOid,
        enrolledAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$enrolledAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: "$_id", count: 1, _id: 0 } },
  ]);

  return {
    totalCourses,
    publishedCourses,
    totalEnrollments,
    totalCompletions,
    totalCourseRevenue,
    topCourses: topCourses.map((c) => ({
      courseId: String(c._id),
      title: (c as Record<string, unknown>).title,
      enrollmentCount: ((c as Record<string, unknown>).stats as Record<string, unknown>).enrollmentCount,
      completionRate: ((c as Record<string, unknown>).stats as Record<string, unknown>).completionRate,
      avgRating: ((c as Record<string, unknown>).stats as Record<string, unknown>).avgRating,
      revenue: 0, // Would need per-product lookup
    })),
    enrollmentTrend,
  };
}
