import http from "http";
import { env } from "./shared/config/env";
import { initSentry } from "./observability/sentry";
import { logger } from "./shared/logger";
import { connectMongo } from "./db/mongoose";
import { getRedis } from "./queue/redisClient";
import { buildApp } from "./api/server";
import { initSocketServer } from "./shared/socket/socketServer";
import "./shared/bootstrap";

initSentry();

async function start() {
  try {
    await connectMongo();

    if (env.REDIS_URL) {
      await getRedis().ping();
    } else {
      logger.warn({ msg: "REDIS_URL not set; skipping Redis connection" });
    }

    const app = buildApp();
    const httpServer = http.createServer(app);

    // Initialize Socket.io on the same HTTP server
    initSocketServer(httpServer);

    httpServer.listen(env.PORT, () => {
      logger.info({ msg: "API listening", port: env.PORT, env: env.NODE_ENV });
    });

    maybeStartEmbeddedWorkers();
  } catch (err) {
    logger.fatal({ msg: "Failed to start server", err });
    process.exit(1);
  }
}

function maybeStartEmbeddedWorkers() {
  if (!shouldEmbedWorkers()) {
    logger.debug({ msg: "Embedded workers disabled" });
    return;
  }

  if (!env.REDIS_URL) {
    logger.warn({ msg: "Skipping embedded workers; REDIS_URL not configured" });
    return;
  }

  (async () => {
    try {
      const { bootstrapWorkers } = await import("./worker/index");
      await bootstrapWorkers({
        initSentry: false,
        reuseExistingMongo: true,
        mode: "embedded",
      });
      logger.info({ msg: "Embedded workers running" });
    } catch (error) {
      logger.error({ msg: "Failed to start embedded workers", error });
    }
  })();
}

function shouldEmbedWorkers() {
  const flag = process.env.EMBED_WORKERS?.toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.NODE_ENV !== "production";
}

process.on("unhandledRejection", (reason) => {
  logger.error({ msg: "unhandledRejection", reason });
});

process.on("uncaughtException", (err) => {
  logger.fatal({ msg: "uncaughtException", err });
  process.exit(1);
});

start();

