import { Queue } from "bullmq";
import { getRedis } from "./redisClient";

const connection = getRedis();

// NOTE: BullMQ v5 does not allow ":" in queue names, so we use "_" instead.
export const testSchedulerQueue = new Queue("test_scheduler", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

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
  const delay = Math.max(0, new Date(startTime).getTime() - Date.now());
  return testSchedulerQueue.add(
    "goLiveAtTime",
    { testId, startTime } as GoLiveAtTimeJobData,
    { delay }
  );
}

export async function addAutoCompleteJob(testId: string, endTime: string) {
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
  const delay = Math.max(0, new Date(dueAt).getTime() - Date.now());
  return testSchedulerQueue.add(
    "autoSubmitAttempt",
    { attemptId, dueAt } as AutoSubmitAttemptJobData,
    { delay }
  );
}
