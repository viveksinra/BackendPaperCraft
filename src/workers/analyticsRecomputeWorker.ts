import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { recomputeAfterTestCompletion } from "../services/analyticsComputationService";
import { logger } from "../shared/logger";

let worker: Worker | null = null;

export function startAnalyticsRecomputeWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "analytics_recompute",
    async (job: Job) => {
      const { companyId, studentUserId, testId } = job.data as {
        companyId: string;
        studentUserId: string;
        testId: string;
      };

      logger.info({
        msg: "Analytics recompute started",
        companyId,
        studentUserId,
        testId,
        jobId: job.id,
      });

      await recomputeAfterTestCompletion(companyId, testId, studentUserId);

      logger.info({
        msg: "Analytics recompute completed",
        companyId,
        studentUserId,
        testId,
        jobId: job.id,
      });

      return { success: true };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Analytics recompute failed",
      jobId: job?.id,
      data: job?.data,
      error: error?.message,
    });
  });

  worker.on("error", (error) => {
    logger.error({ msg: "Analytics recompute worker error", error: error.message });
  });

  logger.info({ msg: "Analytics recompute worker started" });
  return worker;
}

export async function stopAnalyticsRecomputeWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
