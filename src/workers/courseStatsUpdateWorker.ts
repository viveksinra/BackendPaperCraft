import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { CourseModel } from "../models/course";
import { CourseEnrollmentModel } from "../models/courseEnrollment";
import { logger } from "../shared/logger";

let worker: Worker | null = null;

export interface CourseStatsUpdateJobData {
  tenantId: string;
  companyId: string;
  courseId: string;
}

export function startCourseStatsUpdateWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "course_stats_update",
    async (job: Job<CourseStatsUpdateJobData>) => {
      const { courseId } = job.data;

      logger.info({ msg: "Course stats update started", courseId, jobId: job.id });

      const course = await CourseModel.findById(courseId);
      if (!course) {
        logger.warn({ msg: "Course not found for stats update", courseId });
        return { success: false };
      }

      // Count enrollments by status
      const [totalEnrollments, completedEnrollments] = await Promise.all([
        CourseEnrollmentModel.countDocuments({ courseId }),
        CourseEnrollmentModel.countDocuments({ courseId, status: "completed" }),
      ]);

      // Calculate average rating
      const ratingAgg = await CourseEnrollmentModel.aggregate([
        { $match: { courseId: course._id, review: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$review.rating" },
            ratingCount: { $sum: 1 },
          },
        },
      ]);

      // Count total lessons and sum duration
      let totalLessons = 0;
      let totalDurationMinutes = 0;
      for (const section of course.sections) {
        totalLessons += section.lessons.length;
        for (const lesson of section.lessons) {
          totalDurationMinutes += lesson.estimatedMinutes || 0;
        }
      }

      const completionRate = totalEnrollments > 0
        ? Math.round((completedEnrollments / totalEnrollments) * 100)
        : 0;

      await CourseModel.updateOne(
        { _id: courseId },
        {
          $set: {
            "stats.enrollmentCount": totalEnrollments,
            "stats.completionRate": completionRate,
            "stats.avgRating": ratingAgg[0]?.avgRating ? Math.round(ratingAgg[0].avgRating * 10) / 10 : 0,
            "stats.ratingCount": ratingAgg[0]?.ratingCount || 0,
            "stats.totalLessons": totalLessons,
            "stats.totalDurationMinutes": totalDurationMinutes,
          },
        }
      );

      logger.info({ msg: "Course stats update completed", courseId, jobId: job.id });
      return { success: true };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({
      msg: "Course stats update job failed",
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info({ msg: "Course stats update worker started" });
  return worker;
}
