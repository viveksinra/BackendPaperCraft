import { Router, Response } from "express";
import mongoose from "mongoose";
import { getRedis } from "../../queue/redisClient";

export const healthRouter = Router();

const healthResponder = (_req: unknown, res: Response) =>
  res.ok("health ok", { timestamp: new Date().toISOString() });

healthRouter.get("/health", healthResponder);
healthRouter.get("/api/v1/health", healthResponder);

healthRouter.get("/readiness", async (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  let redisReady = false;
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    redisReady = pong === "PONG";
  } catch {
    redisReady = false;
  }

  const ready = mongoReady && redisReady;
  if (ready) {
    return res.ok("ready", { checks: { mongo: mongoReady, redis: redisReady } });
  }
  return res.fail("NOT_READY", "Dependencies not ready", {
    status: 503,
    meta: { checks: { mongo: mongoReady, redis: redisReady } },
  });
});

