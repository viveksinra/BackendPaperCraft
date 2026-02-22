import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { generateCertificate } from "../services/certificateService";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

let worker: Worker | null = null;

export interface CertificateGenerationJobData {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  enrollmentId: string;
}

export function startCertificateGenerationWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "certificate_generation",
    async (job: Job<CertificateGenerationJobData>) => {
      const { tenantId, companyId, courseId, studentUserId, enrollmentId } = job.data;

      logger.info({
        msg: "Certificate generation started",
        enrollmentId,
        jobId: job.id,
      });

      const result = await generateCertificate({
        tenantId,
        companyId,
        courseId,
        studentUserId,
        enrollmentId,
      });

      // Queue certificate notification email
      try {
        await addNotificationJob({
          type: "course_certificate",
          courseId,
          studentUserId,
          companyId,
          certificateNumber: result.certificateNumber,
          certificateUrl: result.certificateUrl,
        });
      } catch (err) {
        logger.warn({
          msg: "Failed to queue certificate notification",
          error: (err as Error).message,
        });
      }

      logger.info({
        msg: "Certificate generation completed",
        enrollmentId,
        certificateNumber: result.certificateNumber,
        jobId: job.id,
      });

      return { success: true, ...result };
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({
      msg: "Certificate generation job failed",
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info({ msg: "Certificate generation worker started" });
  return worker;
}
