import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { logger } from "../shared/logger";

const QUEUE_NAME = "notifications";

export interface NotificationJobData {
  type: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  companyId?: string;
  tenantId?: string;
}

// Notification types for Phase 5
export const NOTIFICATION_TYPES = {
  HOMEWORK_ASSIGNED: "homework_assigned",
  HOMEWORK_DUE_SOON: "homework_due_soon",
  HOMEWORK_OVERDUE: "homework_overdue",
  HOMEWORK_GRADED: "homework_graded",
  FEE_REMINDER: "fee_reminder",
  ANNOUNCEMENT_POSTED: "announcement_posted",
} as const;

export function startNotificationDispatcherWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping notification dispatcher worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const { type, recipientUserIds, title, body, referenceType, referenceId } = job.data;

      logger.info({
        msg: "Dispatching notifications",
        type,
        recipientCount: recipientUserIds.length,
        jobId: job.id,
      });

      // In production, this would:
      // 1. Bulk create Notification documents in MongoDB
      // 2. Check user email preferences
      // 3. Queue email sends for opted-in users
      // 4. Emit Socket.io events for online users

      // For now, log the notification dispatch
      for (const userId of recipientUserIds) {
        logger.info({
          msg: "Notification dispatched",
          type,
          userId,
          title,
          referenceType,
          referenceId,
        });
      }

      return {
        type,
        dispatched: recipientUserIds.length,
      };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Notification dispatch job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Notification dispatcher worker started", queue: QUEUE_NAME });
  return worker;
}
