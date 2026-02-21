import { Router } from "express";
import client from "prom-client";

export const metricsRouter = Router();
export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

export const apiRequestDuration = new client.Histogram({
  name: "api_request_duration_seconds",
  help: "API request latency by tenant",
  labelNames: ["method", "route", "tenantId", "status"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

metricsRegistry.registerMetric(apiRequestDuration);

metricsRouter.get("/api/v1/metrics", async (_req, res) => {
  res.setHeader("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});
