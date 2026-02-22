import { Queue, Worker } from "bullmq";
import { ReportModel } from "../models/report";
import { deleteS3Object } from "../utils/s3";
import { logger } from "../shared/logger";

let reportCleanupQueue: Queue | null = null;

export function startReportCleanupJob(connection: {
  host: string;
  port: number;
}) {
  reportCleanupQueue = new Queue("report_cleanup", {
    connection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  // Add repeatable job: daily at 3:00 AM UTC
  reportCleanupQueue.add(
    "cleanup",
    {},
    {
      repeat: {
        pattern: "0 3 * * *", // 3:00 AM UTC daily
      },
    }
  );

  const worker = new Worker(
    "report_cleanup",
    async () => {
      logger.info({ msg: "Report cleanup job started" });

      const now = new Date();
      let cleanedCount = 0;

      // Find expired reports with S3 files (backup to TTL index)
      const expiredReports = await ReportModel.find({
        expiresAt: { $lt: now },
        pdfUrl: { $ne: null, $exists: true },
      })
        .select("_id pdfUrl")
        .limit(500)
        .lean();

      for (const report of expiredReports) {
        if (report.pdfUrl) {
          try {
            await deleteS3Object(report.pdfUrl);
            cleanedCount += 1;
          } catch (err) {
            logger.warn({
              msg: "Failed to delete expired report S3 file",
              reportId: String(report._id),
              s3Key: report.pdfUrl,
              error: (err as Error).message,
            });
          }
        }
      }

      logger.info({
        msg: "Report cleanup job completed",
        expiredFound: expiredReports.length,
        s3FilesDeleted: cleanedCount,
      });
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({
      msg: "Report cleanup job failed",
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info({ msg: "Report cleanup scheduled job registered (daily 3:00 AM UTC)" });

  return worker;
}
