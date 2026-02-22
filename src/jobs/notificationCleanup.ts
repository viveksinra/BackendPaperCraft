import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { NotificationModel } from "../models/notification";
import { logger } from "../shared/logger";

const QUEUE_NAME = "notification_cleanup";

export interface CleanupJobData {
  tenantId: string;
  companyId: string;
  olderThanDays?: number;
}

export function startNotificationCleanupWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping notification cleanup worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<CleanupJobData>) => {
      const { tenantId, companyId, olderThanDays = 90 } = job.data;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      // Delete archived notifications older than cutoff
      const archivedResult = await NotificationModel.deleteMany({
        tenantId,
        companyId,
        isArchived: true,
        createdAt: { $lt: cutoff },
      });

      // Delete read notifications older than 2x cutoff
      const readCutoff = new Date();
      readCutoff.setDate(readCutoff.getDate() - olderThanDays * 2);

      const readResult = await NotificationModel.deleteMany({
        tenantId,
        companyId,
        isRead: true,
        createdAt: { $lt: readCutoff },
      });

      logger.info({
        msg: "Notification cleanup completed",
        companyId,
        archivedDeleted: archivedResult.deletedCount,
        readDeleted: readResult.deletedCount,
      });

      return {
        archivedDeleted: archivedResult.deletedCount,
        readDeleted: readResult.deletedCount,
      };
    },
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Notification cleanup job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Notification cleanup worker started", queue: QUEUE_NAME });
  return worker;
}
