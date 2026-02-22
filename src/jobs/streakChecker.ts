import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import * as gamificationService from "../services/gamificationService";
import * as configService from "../services/gamificationConfigService";
import { GamificationConfigModel } from "../models/gamificationConfig";
import { logger } from "../shared/logger";

const QUEUE_NAME = "streak_checker";

export interface StreakCheckerJobData {
  tenantId?: string;
  companyId?: string;
}

export function startStreakCheckerWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping streak checker worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<StreakCheckerJobData>) => {
      const { tenantId, companyId } = job.data;

      logger.info({ msg: "Running streak checker", tenantId, companyId });

      if (tenantId && companyId) {
        // Check for a specific company
        const config = await configService.getOrCreateConfig(tenantId, companyId);
        const gracePeriodHours = config.streakConfig.gracePeriodHours || 48;
        const broken = await gamificationService.checkBrokenStreaks(
          tenantId,
          companyId,
          gracePeriodHours
        );
        logger.info({ msg: "Streak check completed", companyId, brokenStreaks: broken });
        return { companyId, brokenStreaks: broken };
      }

      // Check all companies
      const configs = await GamificationConfigModel.find({ isEnabled: true }).lean();
      let totalBroken = 0;

      for (const config of configs) {
        const gracePeriodHours = config.streakConfig?.gracePeriodHours || 48;
        const broken = await gamificationService.checkBrokenStreaks(
          config.tenantId,
          String(config.companyId),
          gracePeriodHours
        );
        totalBroken += broken;
      }

      logger.info({ msg: "Global streak check completed", totalBroken });
      return { totalBroken };
    },
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Streak checker job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Streak checker worker started", queue: QUEUE_NAME });
  return worker;
}
