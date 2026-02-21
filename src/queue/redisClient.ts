import IORedis from "ioredis";
import { env } from "../shared/config/env";
import { logger } from "../shared/logger";

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redis) {
    if (!env.REDIS_URL) {
      throw new Error("REDIS_URL not configured");
    }
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    redis.on("error", (err) => logger.error({ msg: "Redis error", err }));
    redis.on("connect", () => logger.info({ msg: "Redis connected" }));
  }
  return redis;
}




