import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { logger } from "../shared/logger";
import { requestContext } from "../shared/middleware/requestContext";
import { envelope } from "../shared/middleware/envelope";
import { tenantContext } from "../shared/middleware/tenantContext";
import { authContext } from "../shared/middleware/authContext";
import { healthRouter } from "./routes/health";
import { errorHandler } from "../shared/middleware/errorHandler";
import { metricsRouter, apiRequestDuration } from "./routes/metrics";
import { authV2Router } from "./routes/v2/auth";
import { companiesV2Router } from "./routes/v2/companies";
import { membershipsV2Router, invitePublicRouter } from "./routes/v2/memberships";

export function buildApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID", "X-Company-ID", "X-Request-ID"],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      customProps: (req, res) => ({
        requestId: req.requestId,
        tenantId: req.tenantId,
        route: req.originalUrl,
        status: res.statusCode,
      }),
    })
  );

  app.use(envelope);
  app.use(tenantContext);
  app.use(authContext);

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const routeLabel =
        (req.baseUrl ? `${req.baseUrl}${req.route?.path || ""}` : req.route?.path) ||
        req.originalUrl ||
        req.path ||
        "unknown";
      apiRequestDuration
        .labels(req.method, routeLabel, req.tenantId || "unknownTenant", String(res.statusCode))
        .observe(durationSeconds);
    });
    next();
  });

  app.use(healthRouter);
  app.use(metricsRouter);

  app.use("/api/v2/auth", authV2Router);
  app.use("/api/v2/companies", companiesV2Router);
  app.use("/api/v2/companies/:companyId/memberships", membershipsV2Router);
  app.use("/api/v2/invites", invitePublicRouter);

  app.use((req, res) => {
    res.status(404).sendEnvelope(`Route ${req.originalUrl} not found`, "error");
  });

  app.use(errorHandler);

  return app;
}
