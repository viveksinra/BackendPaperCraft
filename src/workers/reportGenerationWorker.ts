import { Worker, Job } from "bullmq";
import mongoose from "mongoose";
import { getRedis } from "../queue/redisClient";
import { ReportModel } from "../models/report";
import { generateReportPdf } from "../services/reportPdfGenerator";
import { getStudentAnalytics } from "../services/studentAnalyticsService";
import { getClassAnalytics, getClassTestAnalytics } from "../services/classAnalyticsService";
import {
  computeQualificationBand,
  computeComponentScores,
  computeCohortPercentile,
  getQualificationBandConfig,
} from "../services/elevenPlusAnalyticsService";
import { addNotificationJob } from "../queue/queues";
import { logger } from "../shared/logger";

const Company =
  mongoose.models.Company ||
  mongoose.model("Company", new mongoose.Schema({}, { strict: false }));
const User =
  mongoose.models.User ||
  mongoose.model("User", new mongoose.Schema({}, { strict: false }));

let worker: Worker | null = null;

export function startReportGenerationWorker(): Worker {
  if (worker) return worker;

  const connection = getRedis();

  worker = new Worker(
    "report_generation",
    async (job: Job) => {
      const { reportId } = job.data as { reportId: string };
      const startTime = Date.now();

      logger.info({ msg: "Report generation started", reportId, jobId: job.id });

      const report = await ReportModel.findById(reportId);
      if (!report) {
        logger.warn({ msg: "Report not found", reportId });
        return { success: false, reason: "not_found" };
      }

      try {
        // Mark as generating
        report.status = "generating";
        await report.save();

        // Get branding
        const company = (await Company.findById(report.companyId).lean()) as Record<
          string,
          unknown
        > | null;
        const branding = {
          logoUrl: (company?.branding as Record<string, unknown>)?.logoUrl as string || "",
          primaryColor: (company?.branding as Record<string, unknown>)?.primaryColor as string || "#2563eb",
          secondaryColor: (company?.branding as Record<string, unknown>)?.secondaryColor as string || "#1e40af",
          instituteName: (company?.name as string) || "PaperCraft Institute",
        };

        // Gather report data based on type
        const reportData = await gatherReportData(report);

        const s3Key = `reports/${report.companyId}/${reportId}.pdf`;
        const { pdfUrl, pdfSize } = await generateReportPdf(
          reportData,
          report.templateId || "standard",
          branding,
          s3Key
        );

        // Update report
        report.status = "completed";
        report.pdfUrl = pdfUrl;
        report.pdfSize = pdfSize;
        report.generatedAt = new Date();
        await report.save();

        // Notify
        if (report.studentUserId) {
          try {
            await addNotificationJob({
              type: "report_ready",
              recipientUserIds: [report.studentUserId.toString()],
              title: "Report Ready",
              body: `Your "${report.title}" report is ready for download.`,
              referenceType: "report",
              referenceId: reportId,
              companyId: report.companyId.toString(),
            });
          } catch {
            // Non-critical
          }
        }

        const duration = Date.now() - startTime;
        logger.info({
          msg: "Report generation completed",
          reportId,
          pdfSize,
          durationMs: duration,
        });

        return { success: true, pdfSize };
      } catch (error) {
        report.status = "failed";
        report.failureReason = (error as Error).message;
        await report.save();

        logger.error({
          msg: "Report generation failed",
          reportId,
          error: (error as Error).message,
        });

        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error({ msg: "Report generation worker error", error: error.message });
  });

  logger.info({ msg: "Report generation worker started" });
  return worker;
}

async function gatherReportData(report: InstanceType<typeof ReportModel>): Promise<Record<string, unknown>> {
  const companyId = report.companyId.toString();
  const generatedDate = new Date().toISOString().substring(0, 10);

  if (report.type === "progress_report" && report.studentUserId) {
    const studentUserId = report.studentUserId.toString();
    const analytics = await getStudentAnalytics(companyId, studentUserId);
    const user = (await User.findById(report.studentUserId).lean()) as Record<string, unknown> | null;

    return {
      studentName: (user?.name as string) || "Student",
      yearGroup: (user?.yearGroup as string) || "",
      school: (user?.school as string) || "",
      dateRange: report.dateRange,
      generatedDate,
      overallStats: analytics.overallStats,
      subjectBreakdown: analytics.subjectBreakdown,
      testPerformance: analytics.testPerformance.map((t) => ({
        testTitle: t.testTitle,
        completedAt: new Date(t.completedAt).toISOString().substring(0, 10),
        score: t.score,
        totalMarks: t.totalMarks,
        percentage: t.percentage,
        rank: t.rank,
      })),
      topicPerformance: analytics.topicPerformance,
    };
  }

  if (report.type === "mock_analysis" && report.studentUserId) {
    const studentUserId = report.studentUserId.toString();
    const analytics = await getStudentAnalytics(companyId, studentUserId);
    const user = (await User.findById(report.studentUserId).lean()) as Record<string, unknown> | null;
    const [band, components, percentile, config] = await Promise.all([
      computeQualificationBand(studentUserId, companyId),
      computeComponentScores(studentUserId, companyId),
      computeCohortPercentile(studentUserId, companyId),
      getQualificationBandConfig(companyId),
    ]);

    return {
      studentName: (user?.name as string) || "Student",
      generatedDate,
      dateRange: report.dateRange,
      qualificationBand: band,
      bandThresholds: config,
      cohortPercentile: percentile,
      componentScores: components,
      scoreTrend: analytics.testPerformance.map((t) => ({
        testTitle: t.testTitle,
        date: new Date(t.completedAt).toISOString().substring(0, 10),
        percentage: t.percentage,
      })),
      weakestTopics: analytics.topicPerformance
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5)
        .map((t) => ({ topicName: t.topicName, accuracy: t.accuracy })),
      timeAnalysis: analytics.timeAnalysis,
    };
  }

  if (report.type === "class_summary" && report.classId) {
    const classId = report.classId.toString();
    const Class = mongoose.models.Class || mongoose.model("Class", new mongoose.Schema({}, { strict: false }));
    const cls = (await Class.findById(report.classId).lean()) as Record<string, unknown> | null;
    const overview = await getClassAnalytics(companyId, classId);

    return {
      className: (cls?.name as string) || "Class",
      dateRange: report.dateRange,
      generatedDate,
      overview,
    };
  }

  return { generatedDate };
}

export async function stopReportGenerationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
