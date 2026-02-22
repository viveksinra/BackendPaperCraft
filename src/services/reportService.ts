import mongoose, { Types } from "mongoose";
import { ReportModel, ReportDocument } from "../models/report";
import { getPresignedDownloadUrl, deleteS3Object } from "../utils/s3";
import { logger } from "../shared/logger";

const Class =
  mongoose.models.Class ||
  mongoose.model("Class", new mongoose.Schema({}, { strict: false }));

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// ─── generateReport ─────────────────────────────────────────────────────────

export async function generateReport(
  companyId: string,
  tenantId: string,
  input: {
    type: string;
    title?: string;
    studentUserId?: string;
    classId?: string;
    templateId?: string;
    dateRange?: { startDate?: string; endDate?: string };
  },
  generatorEmail: string
): Promise<ReportDocument> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const title =
    input.title ||
    `${input.type.replace(/_/g, " ")} - ${new Date().toISOString().substring(0, 10)}`;

  const report = await ReportModel.create({
    tenantId,
    companyId: toObjectId(companyId),
    type: input.type,
    title,
    studentUserId: input.studentUserId
      ? toObjectId(input.studentUserId)
      : null,
    classId: input.classId ? toObjectId(input.classId) : null,
    templateId: input.templateId || "standard",
    dateRange: {
      startDate: input.dateRange?.startDate
        ? new Date(input.dateRange.startDate)
        : null,
      endDate: input.dateRange?.endDate
        ? new Date(input.dateRange.endDate)
        : null,
    },
    generatedBy: generatorEmail,
    expiresAt,
  });

  // Queue report generation job
  try {
    const { addReportGenerationJob } = await import("../queue/queues");
    await addReportGenerationJob({ reportId: String(report._id) });
  } catch (err) {
    logger.warn({
      msg: "Failed to queue report generation job",
      reportId: String(report._id),
      error: (err as Error).message,
    });
  }

  logger.info({
    msg: "Report generation requested",
    reportId: String(report._id),
    type: input.type,
    generatedBy: generatorEmail,
  });

  return report;
}

// ─── getReport ──────────────────────────────────────────────────────────────

export async function getReport(
  companyId: string,
  reportId: string
): Promise<ReportDocument & { downloadUrl?: string }> {
  const report = await ReportModel.findOne({
    _id: toObjectId(reportId),
    companyId: toObjectId(companyId),
  });

  if (!report)
    throw Object.assign(new Error("Report not found"), { status: 404 });

  const result = report.toObject() as ReportDocument & {
    downloadUrl?: string;
  };

  if (report.status === "completed" && report.pdfUrl) {
    try {
      result.downloadUrl = await getPresignedDownloadUrl(
        report.pdfUrl,
        3600
      );
    } catch {
      // S3 may be unavailable
    }
  }

  return result;
}

// ─── listReports ────────────────────────────────────────────────────────────

export async function listReports(
  companyId: string,
  filters: {
    type?: string;
    status?: string;
    studentUserId?: string;
    classId?: string;
  },
  pagination: { page: number; pageSize: number }
): Promise<{
  reports: ReportDocument[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const query: Record<string, unknown> = {
    companyId: toObjectId(companyId),
  };

  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.studentUserId)
    query.studentUserId = toObjectId(filters.studentUserId);
  if (filters.classId) query.classId = toObjectId(filters.classId);

  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  const [reports, total] = await Promise.all([
    ReportModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    ReportModel.countDocuments(query),
  ]);

  return {
    reports: reports as unknown as ReportDocument[],
    total,
    page,
    pageSize,
  };
}

// ─── deleteReport ───────────────────────────────────────────────────────────

export async function deleteReport(
  companyId: string,
  reportId: string
): Promise<void> {
  const report = await ReportModel.findOne({
    _id: toObjectId(reportId),
    companyId: toObjectId(companyId),
  });

  if (!report)
    throw Object.assign(new Error("Report not found"), { status: 404 });

  // Delete S3 file if exists
  if (report.pdfUrl) {
    try {
      await deleteS3Object(report.pdfUrl);
    } catch (err) {
      logger.warn({
        msg: "Failed to delete S3 report file",
        s3Key: report.pdfUrl,
        error: (err as Error).message,
      });
    }
  }

  await ReportModel.deleteOne({ _id: report._id });

  logger.info({
    msg: "Report deleted",
    reportId,
  });
}

// ─── generateBulkClassReports ───────────────────────────────────────────────

export async function generateBulkClassReports(
  companyId: string,
  tenantId: string,
  classId: string,
  templateId: string,
  generatorEmail: string
): Promise<{ queued: number }> {
  const cls = (await Class.findById(toObjectId(classId)).lean()) as Record<
    string,
    unknown
  > | null;
  if (!cls)
    throw Object.assign(new Error("Class not found"), { status: 404 });

  const studentIds = ((cls.students as Types.ObjectId[]) || []).map((s) =>
    s.toString()
  );

  let queued = 0;
  for (const studentUserId of studentIds) {
    try {
      await generateReport(
        companyId,
        tenantId,
        {
          type: "progress_report",
          studentUserId,
          classId,
          templateId,
        },
        generatorEmail
      );
      queued += 1;
    } catch (err) {
      logger.warn({
        msg: "Failed to queue bulk report for student",
        studentUserId,
        error: (err as Error).message,
      });
    }
  }

  return { queued };
}

// ─── getStudentReports ──────────────────────────────────────────────────────

export async function getStudentReports(
  studentUserId: string
): Promise<ReportDocument[]> {
  return ReportModel.find({
    studentUserId: toObjectId(studentUserId),
    status: "completed",
  })
    .sort({ createdAt: -1 })
    .lean() as unknown as ReportDocument[];
}

// ─── downloadReport ─────────────────────────────────────────────────────────

export async function downloadReport(
  reportId: string
): Promise<{ downloadUrl: string }> {
  const report = await ReportModel.findById(toObjectId(reportId));
  if (!report)
    throw Object.assign(new Error("Report not found"), { status: 404 });

  if (report.status !== "completed" || !report.pdfUrl)
    throw Object.assign(new Error("Report not ready for download"), {
      status: 400,
    });

  const downloadUrl = await getPresignedDownloadUrl(report.pdfUrl, 3600);
  return { downloadUrl };
}
