import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { logger } from "../shared/logger";
import type {
  GoLiveAtTimeJobData,
  AutoCompleteTestJobData,
  AutoSubmitAttemptJobData,
} from "../queue/testSchedulerQueue";

let worker: Worker | null = null;

export function startTestSchedulerWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "test_scheduler",
    async (job: Job) => {
      const startTime = Date.now();

      logger.info({
        msg: "Test scheduler job started",
        jobName: job.name,
        jobId: job.id,
        data: job.data,
      });

      try {
        switch (job.name) {
          case "goLiveAtTime": {
            const { testId } = job.data as GoLiveAtTimeJobData;
            // Lazy import to avoid circular dependencies
            const onlineTestService = await import(
              "../services/onlineTestService"
            );
            await onlineTestService.goLive(testId, testId, "system");
            break;
          }

          case "autoCompleteTest": {
            const { testId } = job.data as AutoCompleteTestJobData;
            const onlineTestService = await import(
              "../services/onlineTestService"
            );
            await onlineTestService.completeTest(testId, testId, "system");
            break;
          }

          case "autoSubmitAttempt": {
            const { attemptId } = job.data as AutoSubmitAttemptJobData;
            const testAttemptService = await import(
              "../services/testAttemptService"
            );
            // Auto-submit uses the attempt's testId and studentId
            const { TestAttemptModel } = await import(
              "../models/testAttempt"
            );
            const attempt = await TestAttemptModel.findById(attemptId);
            if (attempt && attempt.status === "in_progress") {
              await testAttemptService.autoSubmit(
                attempt.testId.toString(),
                attempt.studentId.toString()
              );
            }
            break;
          }

          default:
            logger.warn({
              msg: "Unknown test scheduler job type",
              jobName: job.name,
            });
        }

        const duration = Date.now() - startTime;
        logger.info({
          msg: "Test scheduler job completed",
          jobName: job.name,
          jobId: job.id,
          durationMs: duration,
        });
      } catch (error) {
        logger.error({
          msg: "Test scheduler job failed",
          jobName: job.name,
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("error", (error) => {
    logger.error({ msg: "Test scheduler worker error", error: error.message });
  });

  logger.info({ msg: "Test scheduler worker started" });
  return worker;
}

export async function stopTestSchedulerWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
