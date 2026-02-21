import { Queue } from "bullmq";
import { getRedis } from "./redisClient";

const connection = getRedis();

// NOTE: BullMQ v5 does not allow ":" in queue names, so we use "_" instead.
// Keep these names in sync with any Worker instances that consume these queues.
export const alertQueue = new Queue("jobs_alert", { connection });

export const pdfGenerationQueue = new Queue("pdf_generation", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function addPdfGenerationJob(paperId: string) {
  return pdfGenerationQueue.add("generatePaperPdfs", { paperId });
}
