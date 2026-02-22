import IORedis from "ioredis";
import { env } from "../shared/config/env";
import { logger } from "../shared/logger";

let redis: IORedis | null = null;
let redisAvailable = false;

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function getRedis(): IORedis {
  if (!redis) {
    if (!env.REDIS_URL) {
      throw new Error("REDIS_URL not configured");
    }
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn({ msg: "Redis retry limit reached; giving up" });
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    redis.on("error", (err) => {
      if (redisAvailable) {
        logger.error({ msg: "Redis error", err });
      }
    });
    redis.on("connect", () => {
      redisAvailable = true;
      logger.info({ msg: "Redis connected" });
    });
    redis.on("close", () => {
      redisAvailable = false;
    });
  }
  return redis;
}




