import { container } from "./container";
import { logger } from "./logger";
import { env } from "./config/env";
import { getRedis, isRedisAvailable } from "../queue/redisClient";

container.register("env", () => env);
container.register("logger", () => logger);
container.register("redis", () => {
  if (!env.REDIS_URL) return null;
  try {
    return getRedis();
  } catch {
    return null;
  }
});

