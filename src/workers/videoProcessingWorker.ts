import { Worker, Job } from "bullmq";
import { getRedis } from "../queue/redisClient";
import { logger } from "../shared/logger";

let worker: Worker | null = null;

export interface VideoProcessingJobData {
  fileKey: string;
  companyId?: string;
  courseId?: string;
  sectionId?: string;
  lessonId?: string;
}

export function startVideoProcessingWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "course_video_processing",
    async (job: Job<VideoProcessingJobData>) => {
      const { fileKey } = job.data;

      logger.info({
        msg: "Video processing started",
        fileKey,
        jobId: job.id,
      });

      // Video processing is a placeholder -- requires ffprobe/ffmpeg binaries
      // In production, this would:
      // 1. Download video from S3 to temp dir
      // 2. Extract duration via ffprobe
      // 3. Generate thumbnail at 10% mark
      // 4. Upload thumbnail to S3
      // 5. Update lesson videoDuration and videoThumbnailUrl
      // 6. Clean up temp files

      logger.info({
        msg: "Video processing completed (stub)",
        fileKey,
        jobId: job.id,
      });

      return { success: true, fileKey };
    },
    {
      connection,
      concurrency: 2,
      limiter: { max: 2, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({
      msg: "Video processing job failed",
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info({ msg: "Video processing worker started" });
  return worker;
}
