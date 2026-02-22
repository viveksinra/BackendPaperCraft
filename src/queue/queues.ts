import { Queue } from "bullmq";
import { getRedis, isRedisAvailable } from "./redisClient";
import { logger } from "../shared/logger";

let alertQueue: Queue | null = null;
let pdfGenerationQueue: Queue | null = null;
let homeworkStatusQueue: Queue | null = null;
let feeReminderQueue: Queue | null = null;
let notificationsQueue: Queue | null = null;
let purchaseConfirmationQueue: Queue | null = null;

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
