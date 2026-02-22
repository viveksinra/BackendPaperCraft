import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import * as gamificationService from "../services/gamificationService";
import { GamificationConfigModel } from "../models/gamificationConfig";
import { logger } from "../shared/logger";

const QUEUE_NAME = "leaderboard_reset";

export interface LeaderboardResetJobData {
  resetType: "weekly" | "monthly";
  tenantId?: string;
  companyId?: string;
}

export function startLeaderboardResetWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping leaderboard reset worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<LeaderboardResetJobData>) => {
      const { resetType, tenantId, companyId } = job.data;

      logger.info({ msg: "Running leaderboard reset", resetType, tenantId, companyId });

      if (tenantId && companyId) {
        const count =
          resetType === "weekly"
            ? await gamificationService.resetWeeklyPoints(tenantId, companyId)
            : await gamificationService.resetMonthlyPoints(tenantId, companyId);

        logger.info({ msg: "Leaderboard reset completed", companyId, resetType, count });
        return { companyId, resetType, count };
      }

      // Reset all companies with matching frequency
      const configs = await GamificationConfigModel.find({
        isEnabled: true,
        "leaderboardConfig.enabled": true,
        "leaderboardConfig.resetFrequency": resetType,
      }).lean();

      let totalReset = 0;

      for (const config of configs) {
        const count =
          resetType === "weekly"
            ? await gamificationService.resetWeeklyPoints(
                config.tenantId,
                String(config.companyId)
              )
            : await gamificationService.resetMonthlyPoints(
                config.tenantId,
                String(config.companyId)
              );
        totalReset += count;
      }

      logger.info({ msg: "Global leaderboard reset completed", resetType, totalReset });
      return { resetType, totalReset };
    },
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Leaderboard reset job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Leaderboard reset worker started", queue: QUEUE_NAME });
  return worker;
}
