import { Queue } from "bullmq";
import { getRedis, isRedisAvailable } from "./redisClient";
import { logger } from "../shared/logger";

let testSchedulerQueue: Queue | null = null;

function ensureQueue() {
  if (testSchedulerQueue) return;
  if (!isRedisAvailable()) return;

  const connection = getRedis();
  // NOTE: BullMQ v5 does not allow ":" in queue names, so we use "_" instead.
  testSchedulerQueue = new Queue("test_scheduler", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "fixed", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

export function getTestSchedulerQueue(): Queue | null {
  ensureQueue();
  return testSchedulerQueue;
}

// ─── Job data interfaces ────────────────────────────────────────────────────

export interface GoLiveAtTimeJobData {
  testId: string;
  startTime: string;
}

export interface AutoCompleteTestJobData {
  testId: string;
  endTime: string;
}

export interface AutoSubmitAttemptJobData {
  attemptId: string;
  dueAt: string;
}

// ─── Job scheduling functions ───────────────────────────────────────────────

export async function addGoLiveJob(testId: string, startTime: string) {
  ensureQueue();
  if (!testSchedulerQueue) {
    logger.warn({ msg: "Redis not available; skipping goLive job", testId });
    return null;
  }
  const delay = Math.max(0, new Date(startTime).getTime() - Date.now());
  return testSchedulerQueue.add(
    "goLiveAtTime",
    { testId, startTime } as GoLiveAtTimeJobData,
    { delay }
  );
}

export async function addAutoCompleteJob(testId: string, endTime: string) {
  ensureQueue();
  if (!testSchedulerQueue) {
    logger.warn({ msg: "Redis not available; skipping autoComplete job", testId });
    return null;
  }
  const delay = Math.max(0, new Date(endTime).getTime() - Date.now());
  return testSchedulerQueue.add(
    "autoCompleteTest",
    { testId, endTime } as AutoCompleteTestJobData,
    { delay }
  );
}

export async function addAutoSubmitAttemptJob(
  attemptId: string,
  dueAt: string
) {
  ensureQueue();
  if (!testSchedulerQueue) {
    logger.warn({ msg: "Redis not available; skipping autoSubmit job", attemptId });
    return null;
  }
  const delay = Math.max(0, new Date(dueAt).getTime() - Date.now());
  return testSchedulerQueue.add(
    "autoSubmitAttempt",
    { attemptId, dueAt } as AutoSubmitAttemptJobData,
    { delay }
  );
}
