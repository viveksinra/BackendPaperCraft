import { Worker, Job, Queue } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { PurchaseModel } from "../models/purchase";
import { logger } from "../shared/logger";

const QUEUE_NAME = "payment_cleanup";

export function startExpiredSessionCleanupWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping expired session cleanup worker" });
    return null;
  }

  const connection = getRedis();

  // Create queue and add repeatable job (every 6 hours)
  const queue = new Queue(QUEUE_NAME, { connection });
  queue.add(
    "cleanupExpiredSessions",
    {},
    {
      repeat: { pattern: "0 */6 * * *" }, // every 6 hours
      removeOnComplete: true,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      logger.info({ msg: "Running expired session cleanup" });

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const result = await PurchaseModel.updateMany(
        {
          status: "pending",
          createdAt: { $lt: cutoff },
        },
        {
          $set: { status: "expired" },
        }
      );

      const expiredCount = result.modifiedCount;

      logger.info({
        msg: "Expired session cleanup completed",
        expiredCount,
      });

      return { expiredCount };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Expired session cleanup job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Expired session cleanup worker started", queue: QUEUE_NAME });
  return worker;
}
