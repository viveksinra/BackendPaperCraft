import mongoose from "mongoose";
import { initSentry } from "../observability/sentry";
import { logger } from "../shared/logger";
import { connectMongo } from "../db/mongoose";
import "../shared/bootstrap";

export type WorkerBootstrapOptions = {
  initSentry?: boolean;
  reuseExistingMongo?: boolean;
  mode?: "embedded" | "standalone";
};

let started = false;
let startingPromise: Promise<void> | null = null;

export async function bootstrapWorkers(options?: WorkerBootstrapOptions): Promise<void> {
  if (started) {
    return;
  }
  if (startingPromise) {
    return startingPromise;
  }

  startingPromise = (async () => {
    const mode = options?.mode || "standalone";
    const shouldInitSentry = options?.initSentry !== false;
    if (shouldInitSentry) {
      initSentry();
    }

    await ensureMongoConnection(options);

    logger.info({
      msg: "Workers bootstrapped",
      mode,
    });
  })();

  try {
    await startingPromise;
    started = true;
  } catch (error) {
    started = false;
    throw error;
  } finally {
    startingPromise = null;
  }
}

async function ensureMongoConnection(options?: WorkerBootstrapOptions) {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (options?.reuseExistingMongo && mongoose.connection.readyState === 2) {
    await new Promise<void>((resolve, reject) => {
      mongoose.connection.once("connected", resolve);
      mongoose.connection.once("error", reject);
    });
    return;
  }

  await connectMongo();
}
