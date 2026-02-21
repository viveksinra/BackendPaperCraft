import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { generatePaperPdfs, closeBrowser } from "../services/pdfGenerationService";
import { PaperModel } from "../models/paper";
import { logger } from "../shared/logger";

let worker: Worker | null = null;

export function startPdfGenerationWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "pdf_generation",
    async (job: Job) => {
      const { paperId } = job.data as { paperId: string };
      const startTime = Date.now();

      logger.info({ msg: "PDF generation started", paperId, jobId: job.id });

      try {
        const results = await generatePaperPdfs(paperId);
        const duration = Date.now() - startTime;
        const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);

        logger.info({
          msg: "PDF generation completed",
          paperId,
          jobId: job.id,
          pdfCount: results.length,
          totalBytes: totalSize,
          durationMs: duration,
        });

        return { success: true, pdfCount: results.length, totalBytes: totalSize };
      } catch (error) {
        logger.error({
          msg: "PDF generation failed",
          paperId,
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  // On final failure (all retries exhausted), revert paper to draft
  worker.on("failed", async (job, error) => {
    if (!job) return;
    const maxAttempts = job.opts?.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      const { paperId } = job.data as { paperId: string };
      logger.error({
        msg: "PDF generation permanently failed, reverting paper to draft",
        paperId,
        jobId: job.id,
        error: error?.message,
      });

      try {
        await PaperModel.updateOne(
          { _id: paperId, status: "finalized" },
          { $set: { status: "draft" } }
        );
      } catch (revertError) {
        logger.error({
          msg: "Failed to revert paper status",
          paperId,
          error: revertError instanceof Error ? revertError.message : String(revertError),
        });
      }
    }
  });

  worker.on("error", (error) => {
    logger.error({ msg: "PDF worker error", error: error.message });
  });

  logger.info({ msg: "PDF generation worker started" });
  return worker;
}

export async function stopPdfGenerationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await closeBrowser();
}
