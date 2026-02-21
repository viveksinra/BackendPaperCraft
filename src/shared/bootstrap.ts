import { container } from "./container";
import { logger } from "./logger";
import { env } from "./config/env";
import { getRedis } from "../queue/redisClient";

container.register("env", () => env);
container.register("logger", () => logger);
container.register("redis", () => getRedis());

