import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { logger } from "../shared/logger";
import { updateHomeworkStatuses } from "../services/homeworkService";

const QUEUE_NAME = "homework_status";

export function startHomeworkStatusWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping homework status worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      logger.info({ msg: "Running homework status update", jobId: job.id });
      try {
        const result = await updateHomeworkStatuses();
        logger.info({
          msg: "Homework status update complete",
          transitioned: result.transitioned,
          notified: result.notified,
        });
        return result;
      } catch (error: any) {
        logger.error({
          msg: "Homework status update failed",
          error: error.message,
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Homework status job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Homework status worker started", queue: QUEUE_NAME });
  return worker;
}
