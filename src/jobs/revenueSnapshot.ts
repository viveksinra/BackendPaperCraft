import { Worker, Job, Queue } from "bullmq";
import mongoose from "mongoose";
import { getRedis, isRedisAvailable } from "../queue/redisClient";
import { PurchaseModel } from "../models/purchase";
import { logger } from "../shared/logger";

const Company = mongoose.model("Company");

const QUEUE_NAME = "revenue_snapshot";

export function startRevenueSnapshotWorker(): Worker | null {
  if (!isRedisAvailable()) {
    logger.warn({ msg: "Redis not available; skipping revenue snapshot worker" });
    return null;
  }

  const connection = getRedis();

  // Create queue and add repeatable job (daily at midnight UTC)
  const queue = new Queue(QUEUE_NAME, { connection });
  queue.add(
    "computeRevenueSnapshot",
    {},
    {
      repeat: { pattern: "0 0 * * *" }, // midnight UTC daily
      removeOnComplete: true,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      logger.info({ msg: "Running daily revenue snapshot" });

      // Find companies with Stripe accounts
      const companies = await Company.find({
        stripeAccountId: { $ne: null },
      })
        .select("_id name")
        .lean();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let processedCount = 0;

      for (const company of companies) {
        try {
          const companyId = (company as Record<string, unknown>)._id as mongoose.Types.ObjectId;

          // Yesterday's revenue
          const [yesterdayResult] = await PurchaseModel.aggregate([
            {
              $match: {
                companyId,
                status: "completed",
                completedAt: { $gte: yesterday, $lt: today },
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ]);

          // Total revenue to date
          const [totalResult] = await PurchaseModel.aggregate([
            {
              $match: {
                companyId,
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ]);

          logger.info({
            msg: "Revenue snapshot computed",
            companyId: companyId.toString(),
            companyName: (company as Record<string, unknown>).name,
            yesterdayRevenue: yesterdayResult?.revenue ?? 0,
            yesterdayTransactions: yesterdayResult?.count ?? 0,
            totalRevenue: totalResult?.revenue ?? 0,
            totalTransactions: totalResult?.count ?? 0,
          });

          processedCount++;
        } catch (err) {
          logger.error({
            msg: "Failed to compute revenue snapshot for company",
            companyId: ((company as Record<string, unknown>)._id as mongoose.Types.ObjectId).toString(),
            error: (err as Error).message,
          });
        }
      }

      logger.info({
        msg: "Revenue snapshot completed",
        companiesProcessed: processedCount,
      });

      return { processedCount };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error({
      msg: "Revenue snapshot job failed",
      jobId: job?.id,
      error: error.message,
    });
  });

  logger.info({ msg: "Revenue snapshot worker started", queue: QUEUE_NAME });
  return worker;
}
