import { Worker, Job, Queue } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { CourseModel } from "../models/course";
import { CourseEnrollmentModel } from "../models/courseEnrollment";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

let worker: Worker | null = null;
let schedulerQueue: Queue | null = null;

export function startDripContentNotifierWorker(): Worker | null {
  if (worker) return worker;
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping drip content notifier" });
    return null;
  }

  const connection = getRedis();

  // Set up repeatable schedule: every hour
  schedulerQueue = new Queue("drip_content_notifier", { connection });
  schedulerQueue.add(
    "checkDripContent",
    {},
    {
      repeat: { pattern: "0 * * * *" },
      removeOnComplete: true,
    }
  ).catch((err) => {
    logger.warn({ msg: "Failed to schedule drip content notifier", error: (err as Error).message });
  });

  worker = new Worker(
    "drip_content_notifier",
    async (job: Job) => {
      logger.info({ msg: "Drip content notifier started", jobId: job.id });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Find all published courses with drip-dated lessons
      const courses = await CourseModel.find({
        status: "published",
        "sections.lessons.dripDate": { $gte: oneHourAgo, $lte: now },
      }).lean();

      let notificationCount = 0;

      for (const course of courses) {
        for (const section of course.sections) {
          for (const lesson of section.lessons) {
            if (!lesson.dripDate) continue;
            const dripDate = new Date(lesson.dripDate);
            if (dripDate < oneHourAgo || dripDate > now) continue;

            // Find enrolled students
            const enrollments = await CourseEnrollmentModel.find({
              courseId: course._id,
              status: "active",
            }).select("studentUserId companyId").lean();

            for (const enrollment of enrollments) {
              try {
                await addNotificationJob({
                  type: "drip_content_available",
                  courseId: String(course._id),
                  courseTitle: course.title,
                  sectionTitle: section.title,
                  lessonTitle: lesson.title,
                  lessonType: lesson.type,
                  studentUserId: enrollment.studentUserId.toString(),
                  companyId: enrollment.companyId.toString(),
                });
                notificationCount++;
              } catch (err) {
                logger.warn({
                  msg: "Failed to queue drip notification",
                  error: (err as Error).message,
                });
              }
            }
          }
        }
      }

      logger.info({
        msg: "Drip content notifier completed",
        notificationCount,
        jobId: job.id,
      });

      return { success: true, notificationCount };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({
      msg: "Drip content notifier job failed",
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info({ msg: "Drip content notifier worker started" });
  return worker;
}
