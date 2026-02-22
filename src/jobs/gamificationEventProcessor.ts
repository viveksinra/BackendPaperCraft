import { Worker, Job } from "bullmq";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import * as gamificationService from "../services/gamificationService";
import { PointSource } from "../models/studentGamification";
import { logger } from "../shared/logger";

const QUEUE_NAME = "gamification_events";

export interface GamificationEventJobData {
  tenantId: string;
  companyId: string;
  studentUserId: string;
  action: PointSource;
  description?: string;
  referenceType?: string;
  referenceId?: string;
}

export function startGamificationEventProcessorWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping gamification event processor worker" });
    return null;
  }

  const connection = getRedis();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<GamificationEventJobData>) => {
      const { tenantId, companyId, studentUserId, action, description, referenceType, referenceId } = job.data;

      logger.info({
        msg: "Processing gamification event",
        action,
        studentUserId,
        jobId: job.id,
      });

      const result = await gamificationService.awardPoints(
        tenantId,
        companyId,
        studentUserId,
        action,
        { description, referenceType, referenceId }
      );

      logger.info({
        msg: "Gamification event processed",
        action,
        studentUserId,
        pointsAwarded: result.pointsAwarded,
        levelUp: result.levelUp,
        badgesEarned: result.badgesEarned,
      });

      return result;
    },
    { connection, concurrency: 5 }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Gamification event processing failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Gamification event processor worker started", queue: QUEUE_NAME });
  return worker;
}
