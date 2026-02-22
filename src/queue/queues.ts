import { Queue } from "bullmq";
import { getRedis, isRedisAvailable } from "./redisClient";
import { logger } from "../shared/logger";

let alertQueue: Queue | null = null;
let pdfGenerationQueue: Queue | null = null;
let homeworkStatusQueue: Queue | null = null;
let feeReminderQueue: Queue | null = null;
let notificationsQueue: Queue | null = null;
let purchaseConfirmationQueue: Queue | null = null;
let analyticsRecomputeQueue: Queue | null = null;
let reportGenerationQueue: Queue | null = null;
let videoProcessingQueue: Queue | null = null;
let certificateGenerationQueue: Queue | null = null;
let courseStatsUpdateQueue: Queue | null = null;

// Phase 9 queues
let notificationEmailQueue: Queue | null = null;
let notificationCleanupQueue: Queue | null = null;
let gamificationEventsQueue: Queue | null = null;
let streakCheckerQueue: Queue | null = null;
let leaderboardResetQueue: Queue | null = null;

function ensureQueues() {
  if (alertQueue) return;
  if (!isRedisAvailable()) return;

  const connection = getRedis();
  // NOTE: BullMQ v5 does not allow ":" in queue names, so we use "_" instead.
  // Keep these names in sync with any Worker instances that consume these queues.
  alertQueue = new Queue("jobs_alert", { connection });
  pdfGenerationQueue = new Queue("pdf_generation", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  // Phase 5 queues
  homeworkStatusQueue = new Queue("homework_status", {
    connection,
    defaultJobOptions: { attempts: 2, removeOnComplete: true },
  });
  feeReminderQueue = new Queue("fee_reminder", {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
  });
  notificationsQueue = new Queue("notifications", {
    connection,
    defaultJobOptions: { attempts: 3, removeOnComplete: true },
  });

  // Phase 6 queues
  purchaseConfirmationQueue = new Queue("purchase_confirmation", {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
  });

  // Phase 7 queues
  analyticsRecomputeQueue = new Queue("analytics_recompute", {
    connection,
    defaultJobOptions: { attempts: 2, removeOnComplete: true },
  });
  reportGenerationQueue = new Queue("report_generation", {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: false },
  });

  // Phase 8 queues
  videoProcessingQueue = new Queue("course_video_processing", {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: true },
  });
  certificateGenerationQueue = new Queue("certificate_generation", {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
  });
  courseStatsUpdateQueue = new Queue("course_stats_update", {
    connection,
    defaultJobOptions: { attempts: 3, removeOnComplete: true },
  });

  // Phase 9 queues
  notificationEmailQueue = new Queue("notification_email", {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true },
  });
  notificationCleanupQueue = new Queue("notification_cleanup", {
    connection,
    defaultJobOptions: { attempts: 2, removeOnComplete: true },
  });
  gamificationEventsQueue = new Queue("gamification_events", {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true },
  });
  streakCheckerQueue = new Queue("streak_checker", {
    connection,
    defaultJobOptions: { attempts: 2, removeOnComplete: true },
  });
  leaderboardResetQueue = new Queue("leaderboard_reset", {
    connection,
    defaultJobOptions: { attempts: 2, removeOnComplete: true },
  });
}

export function getAlertQueue(): Queue | null {
  ensureQueues();
  return alertQueue;
}

export function getPdfGenerationQueue(): Queue | null {
  ensureQueues();
  return pdfGenerationQueue;
}

export async function addPdfGenerationJob(paperId: string) {
  ensureQueues();
  if (!pdfGenerationQueue) {
    logger.warn({ msg: "Redis not available; skipping PDF generation job", paperId });
    return null;
  }
  return pdfGenerationQueue.add("generatePaperPdfs", { paperId });
}

// Phase 5 queue accessors
export function getHomeworkStatusQueue(): Queue | null {
  ensureQueues();
  return homeworkStatusQueue;
}

export function getFeeReminderQueue(): Queue | null {
  ensureQueues();
  return feeReminderQueue;
}

export function getNotificationsQueue(): Queue | null {
  ensureQueues();
  return notificationsQueue;
}

export async function addFeeReminderJob(data: Record<string, unknown>) {
  ensureQueues();
  if (!feeReminderQueue) {
    logger.warn({ msg: "Redis not available; skipping fee reminder job" });
    return null;
  }
  return feeReminderQueue.add("sendFeeReminder", data);
}

export async function addNotificationJob(data: Record<string, unknown>) {
  ensureQueues();
  if (!notificationsQueue) {
    logger.warn({ msg: "Redis not available; skipping notification job" });
    return null;
  }
  return notificationsQueue.add("dispatchNotification", data);
}

// Phase 6 queue accessors
export function getPurchaseConfirmationQueue(): Queue | null {
  ensureQueues();
  return purchaseConfirmationQueue;
}

export async function addPurchaseConfirmationJob(data: { purchaseId: string }) {
  ensureQueues();
  if (!purchaseConfirmationQueue) {
    logger.warn({ msg: "Redis not available; skipping purchase confirmation job" });
    return null;
  }
  return purchaseConfirmationQueue.add("sendPurchaseConfirmation", data);
}

// Phase 7 queue accessors
export function getAnalyticsRecomputeQueue(): Queue | null {
  ensureQueues();
  return analyticsRecomputeQueue;
}

export function getReportGenerationQueue(): Queue | null {
  ensureQueues();
  return reportGenerationQueue;
}

export async function addAnalyticsRecomputeJob(data: {
  companyId: string;
  studentUserId: string;
  testId: string;
}) {
  ensureQueues();
  if (!analyticsRecomputeQueue) {
    logger.warn({ msg: "Redis not available; skipping analytics recompute job" });
    return null;
  }
  return analyticsRecomputeQueue.add("recomputeAnalytics", data);
}

export async function addReportGenerationJob(data: { reportId: string }) {
  ensureQueues();
  if (!reportGenerationQueue) {
    logger.warn({ msg: "Redis not available; skipping report generation job" });
    return null;
  }
  return reportGenerationQueue.add("generateReport", data);
}

// Phase 8 queue accessors
export function getVideoProcessingQueue(): Queue | null {
  ensureQueues();
  return videoProcessingQueue;
}

export function getCertificateGenerationQueue(): Queue | null {
  ensureQueues();
  return certificateGenerationQueue;
}

export function getCourseStatsUpdateQueue(): Queue | null {
  ensureQueues();
  return courseStatsUpdateQueue;
}

export async function addVideoProcessingJob(data: Record<string, unknown>) {
  ensureQueues();
  if (!videoProcessingQueue) {
    logger.warn({ msg: "Redis not available; skipping video processing job" });
    return null;
  }
  return videoProcessingQueue.add("processVideo", data);
}

export async function addCertificateGenerationJob(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  enrollmentId: string;
}) {
  ensureQueues();
  if (!certificateGenerationQueue) {
    logger.warn({ msg: "Redis not available; skipping certificate generation job" });
    return null;
  }
  return certificateGenerationQueue.add("generateCertificate", data);
}

export async function addCourseStatsUpdateJob(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
}) {
  ensureQueues();
  if (!courseStatsUpdateQueue) {
    logger.warn({ msg: "Redis not available; skipping course stats update job" });
    return null;
  }
  return courseStatsUpdateQueue.add("updateCourseStats", data);
}

// Phase 9 queue accessors
export function getNotificationEmailQueue(): Queue | null {
  ensureQueues();
  return notificationEmailQueue;
}

export function getNotificationCleanupQueue(): Queue | null {
  ensureQueues();
  return notificationCleanupQueue;
}

export function getGamificationEventsQueue(): Queue | null {
  ensureQueues();
  return gamificationEventsQueue;
}

export function getStreakCheckerQueue(): Queue | null {
  ensureQueues();
  return streakCheckerQueue;
}

export function getLeaderboardResetQueue(): Queue | null {
  ensureQueues();
  return leaderboardResetQueue;
}

export async function addNotificationEmailJob(data: {
  recipientEmail: string;
  recipientName: string;
  type: string;
  subject: string;
  title: string;
  body: string;
  actionUrl?: string;
  companyName?: string;
}) {
  ensureQueues();
  if (!notificationEmailQueue) {
    logger.warn({ msg: "Redis not available; skipping notification email job" });
    return null;
  }
  return notificationEmailQueue.add("sendNotificationEmail", data);
}

export async function addGamificationEventJob(data: {
  tenantId: string;
  companyId: string;
  studentUserId: string;
  action: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
}) {
  ensureQueues();
  if (!gamificationEventsQueue) {
    logger.warn({ msg: "Redis not available; skipping gamification event job" });
    return null;
  }
  return gamificationEventsQueue.add("processGamificationEvent", data);
}

export async function addStreakCheckerJob(data?: {
  tenantId?: string;
  companyId?: string;
}) {
  ensureQueues();
  if (!streakCheckerQueue) {
    logger.warn({ msg: "Redis not available; skipping streak checker job" });
    return null;
  }
  return streakCheckerQueue.add("checkStreaks", data || {});
}

export async function addLeaderboardResetJob(data: {
  resetType: "weekly" | "monthly";
  tenantId?: string;
  companyId?: string;
}) {
  ensureQueues();
  if (!leaderboardResetQueue) {
    logger.warn({ msg: "Redis not available; skipping leaderboard reset job" });
    return null;
  }
  return leaderboardResetQueue.add("resetLeaderboard", data);
}
