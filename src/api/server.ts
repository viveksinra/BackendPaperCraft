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
import { paperTemplatesV2Router } from "./routes/v2/paperTemplates";
import { paperBlueprintsV2Router } from "./routes/v2/paperBlueprints";
import { papersV2Router } from "./routes/v2/papers";
import { paperSetsV2Router } from "./routes/v2/paperSets";
import { onlineTestsV2Router } from "./routes/v2/onlineTests";
import { testTakingV2Router } from "./routes/v2/testTaking";
import { studentAuthV2Router } from "./routes/v2/studentAuth";
import { studentV2Router } from "./routes/v2/student";
import { parentAuthV2Router } from "./routes/v2/parentAuth";
import { parentV2Router } from "./routes/v2/parent";
import { classesV2Router } from "./routes/v2/classes";
import { homeworkV2Router } from "./routes/v2/homework";
import { studentHomeworkV2Router } from "./routes/v2/studentHomework";
import { announcementsV2Router } from "./routes/v2/announcements";
import { studentAnnouncementsV2Router } from "./routes/v2/studentAnnouncements";
import { feesV2Router } from "./routes/v2/fees";
import { productsV2Router } from "./routes/v2/products";
import { catalogV2Router } from "./routes/v2/catalog";
import { checkoutV2Router } from "./routes/v2/checkout";
import { purchasesV2Router } from "./routes/v2/purchases";
import { revenueV2Router } from "./routes/v2/revenue";
import { stripeConnectV2Router } from "./routes/v2/stripeConnect";
import { stripeWebhookV2Router } from "./routes/v2/stripeWebhook";
import { analyticsV2Router } from "./routes/v2/analytics";
import { classAnalyticsV2Router } from "./routes/v2/classAnalytics";
import { instituteAnalyticsV2Router } from "./routes/v2/instituteAnalytics";
import { questionAnalyticsV2Router } from "./routes/v2/questionAnalytics";
import { elevenPlusAnalyticsV2Router } from "./routes/v2/elevenPlusAnalytics";
import { reportsV2Router } from "./routes/v2/reports";
import { studentAnalyticsV2Router } from "./routes/v2/studentAnalytics";
import { studentAdminV2Router } from "./routes/v2/studentAdmin";
import { coursesV2Router } from "./routes/v2/courses";
import { courseContentV2Router } from "./routes/v2/courseContent";
import { courseUploadV2Router } from "./routes/v2/courseUpload";
import { courseCatalogV2Router } from "./routes/v2/courseCatalog";
import { courseEnrollmentV2Router } from "./routes/v2/courseEnrollment";
import { certificatesV2Router } from "./routes/v2/certificates";
import { courseAnalyticsV2Router } from "./routes/v2/courseAnalytics";
import { parentCoursesV2Router } from "./routes/v2/parentCourses";
import { questionsV2Router } from "./routes/v2/questions";
import { subjectsV2Router } from "./routes/v2/subjects";

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

  // Stripe webhook MUST receive the raw body for signature verification.
  // Register BEFORE the JSON body parser.
  app.use("/api/v2/webhooks", stripeWebhookV2Router);

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

  // Phase 1: Question Bank Engine
  app.use("/api/v2/companies/:companyId/questions", questionsV2Router);
  app.use("/api/v2/companies/:companyId/subjects", subjectsV2Router);

  // Phase 2: Paper Creation & PDF Generation
  app.use("/api/v2/companies/:companyId/paper-templates", paperTemplatesV2Router);
  app.use("/api/v2/companies/:companyId/paper-blueprints", paperBlueprintsV2Router);
  app.use("/api/v2/companies/:companyId/papers", papersV2Router);
  app.use("/api/v2/companies/:companyId/paper-sets", paperSetsV2Router);

  // Phase 3: Online Test Engine
  app.use("/api/v2/companies/:companyId/online-tests", onlineTestsV2Router);
  app.use("/api/v2/tests", testTakingV2Router);

  // Phase 4: Student & Parent Portal
  app.use("/api/v2/auth/student", studentAuthV2Router);
  app.use("/api/v2/student", studentV2Router);
  app.use("/api/v2/auth/parent", parentAuthV2Router);
  app.use("/api/v2/parent", parentV2Router);
  app.use("/api/v2/companies/:companyId/students", studentAdminV2Router);

  // Phase 5: Class Management, Homework & Fee Tracking
  app.use("/api/v2/companies/:companyId/classes", classesV2Router);
  app.use("/api/v2/companies/:companyId/homework", homeworkV2Router);
  app.use("/api/v2/student/homework", studentHomeworkV2Router);
  app.use("/api/v2/companies/:companyId/announcements", announcementsV2Router);
  app.use("/api/v2/student/announcements", studentAnnouncementsV2Router);
  app.use("/api/v2/companies/:companyId/fees", feesV2Router);

  // Phase 6: Payments & Monetization (Stripe)
  app.use("/api/v2/companies/:companyId/products", productsV2Router);
  app.use("/api/v2/companies/:companyId/catalog", catalogV2Router);
  app.use("/api/v2/checkout", checkoutV2Router);
  app.use("/api/v2", purchasesV2Router);
  app.use("/api/v2/companies/:companyId/revenue", revenueV2Router);
  app.use("/api/v2/companies/:companyId/stripe", stripeConnectV2Router);
  // Note: stripeWebhookV2Router is registered above (before JSON parser) for raw body handling

  // Phase 7: Analytics & Reporting
  app.use("/api/v2/companies/:companyId/analytics", analyticsV2Router);
  app.use("/api/v2/companies/:companyId/classes/:classId/analytics", classAnalyticsV2Router);
  app.use("/api/v2/companies/:companyId/analytics/institute", instituteAnalyticsV2Router);
  app.use("/api/v2/companies/:companyId/analytics/questions", questionAnalyticsV2Router);
  app.use("/api/v2/companies/:companyId/analytics/eleven-plus", elevenPlusAnalyticsV2Router);
  app.use("/api/v2/companies/:companyId/reports", reportsV2Router);
  app.use("/api/v2/student", studentAnalyticsV2Router);

  // Phase 8: Udemy-Style Course Builder
  app.use("/api/v2/companies/:companyId/courses", coursesV2Router);
  app.use("/api/v2/companies/:companyId/courses/:courseId", courseContentV2Router);
  app.use("/api/v2/companies/:companyId/courses/:courseId", courseUploadV2Router);
  app.use("/api/v2/companies/:companyId/catalog", courseCatalogV2Router);
  app.use("/api/v2/courses", courseEnrollmentV2Router);
  app.use("/api/v2/certificates", certificatesV2Router);
  app.use("/api/v2/companies/:companyId/course-analytics", courseAnalyticsV2Router);
  app.use("/api/v2/parent", parentCoursesV2Router);

  app.use((req, res) => {
    res.status(404).sendEnvelope(`Route ${req.originalUrl} not found`, "error");
  });

  app.use(errorHandler);

  return app;
}
