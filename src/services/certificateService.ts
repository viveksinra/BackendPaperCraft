import mongoose, { Types } from "mongoose";
import { CourseModel } from "../models/course";
import { CourseEnrollmentModel } from "../models/courseEnrollment";
import { uploadPdfToS3, getPresignedDownloadUrl } from "../utils/s3";
import { generateCertificateHtml } from "./certificateTemplate";
import { logger } from "../shared/logger";

const User =
  mongoose.models.User ||
  mongoose.model("User", new mongoose.Schema({}, { strict: false }));

const Company =
  mongoose.models.Company ||
  mongoose.model("Company", new mongoose.Schema({}, { strict: false }));

// ─── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new Types.ObjectId(id);
}

function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `CERT-${year}-${random}`;
}

// ─── 1. Generate Certificate ───────────────────────────────────────────────

export async function generateCertificate(data: {
  tenantId: string;
  companyId: string;
  courseId: string;
  studentUserId: string;
  enrollmentId: string;
}): Promise<{ certificateUrl: string; certificateNumber: string }> {
  const enrollment = await CourseEnrollmentModel.findById(toObjectId(data.enrollmentId));
  if (!enrollment) {
    throw Object.assign(new Error("Enrollment not found"), { status: 404 });
  }

  // Skip if already issued
  if (enrollment.certificate.issued) {
    return {
      certificateUrl: enrollment.certificate.certificateUrl,
      certificateNumber: enrollment.certificate.certificateNumber,
    };
  }

  const [course, student, company] = await Promise.all([
    CourseModel.findById(toObjectId(data.courseId)).lean(),
    User.findById(toObjectId(data.studentUserId)).lean(),
    Company.findById(toObjectId(data.companyId)).lean(),
  ]);

  if (!course || !student || !company) {
    throw Object.assign(new Error("Missing data for certificate"), { status: 404 });
  }

  // Generate unique certificate number
  let certificateNumber = generateCertificateNumber();
  let exists = await CourseEnrollmentModel.findOne({
    "certificate.certificateNumber": certificateNumber,
  });
  while (exists) {
    certificateNumber = generateCertificateNumber();
    exists = await CourseEnrollmentModel.findOne({
      "certificate.certificateNumber": certificateNumber,
    });
  }

  // Get teacher name
  const teacher = await User.findById(course.teacherId).lean() as Record<string, unknown> | null;
  const teacherName = teacher
    ? `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || (teacher.email as string)
    : "Instructor";

  const studentName = `${(student as Record<string, unknown>).firstName || ""} ${(student as Record<string, unknown>).lastName || ""}`.trim()
    || ((student as Record<string, unknown>).email as string);
  const instituteName = ((company as Record<string, unknown>).name as string) || "Institute";

  // Generate HTML
  const html = generateCertificateHtml({
    studentName,
    courseName: (course as Record<string, unknown>).title as string,
    teacherName,
    instituteName,
    completionDate: enrollment.completedAt || new Date(),
    totalLessons: ((course as Record<string, unknown>).stats as Record<string, unknown>).totalLessons as number,
    totalDurationMinutes: ((course as Record<string, unknown>).stats as Record<string, unknown>).totalDurationMinutes as number,
    certificateNumber,
  });

  // Render to PDF via Puppeteer
  let pdfBuffer: Buffer;
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    pdfBuffer = Buffer.from(
      await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
      })
    );
    await browser.close();
  } catch (err) {
    logger.error({ msg: "Puppeteer failed", error: (err as Error).message });
    throw Object.assign(new Error("Certificate PDF generation failed"), { status: 500 });
  }

  // Upload to S3
  const s3Key = `courses/${data.companyId}/certificates/${certificateNumber}.pdf`;
  await uploadPdfToS3(pdfBuffer, s3Key);

  // Update enrollment
  enrollment.certificate = {
    issued: true,
    issuedAt: new Date(),
    certificateUrl: s3Key,
    certificateNumber,
  };
  await enrollment.save();

  logger.info({ msg: "Certificate generated", certificateNumber, enrollmentId: data.enrollmentId });

  return { certificateUrl: s3Key, certificateNumber };
}

// ─── 2. Verify Certificate ─────────────────────────────────────────────────

export async function verifyCertificate(
  certificateNumber: string
): Promise<{
  studentName: string;
  courseName: string;
  instituteName: string;
  completedAt: Date;
  certificateUrl: string;
} | null> {
  const enrollment = await CourseEnrollmentModel.findOne({
    "certificate.certificateNumber": certificateNumber,
    "certificate.issued": true,
  }).lean();

  if (!enrollment) return null;

  const [course, student, company] = await Promise.all([
    CourseModel.findById(enrollment.courseId).lean(),
    User.findById(enrollment.studentUserId).lean(),
    Company.findById(enrollment.companyId).lean(),
  ]);

  if (!course || !student || !company) return null;

  const studentName = `${(student as Record<string, unknown>).firstName || ""} ${(student as Record<string, unknown>).lastName || ""}`.trim()
    || ((student as Record<string, unknown>).email as string);

  return {
    studentName,
    courseName: (course as Record<string, unknown>).title as string,
    instituteName: ((company as Record<string, unknown>).name as string) || "Institute",
    completedAt: enrollment.completedAt || enrollment.createdAt,
    certificateUrl: enrollment.certificate.certificateUrl,
  };
}

// ─── 3. Get Certificate Download URL ───────────────────────────────────────

export async function getCertificateDownloadUrl(
  tenantId: string,
  companyId: string,
  enrollmentId: string,
  studentUserId: string
): Promise<{ downloadUrl: string }> {
  const enrollment = await CourseEnrollmentModel.findOne({
    _id: toObjectId(enrollmentId),
    tenantId,
    companyId: toObjectId(companyId),
    studentUserId: toObjectId(studentUserId),
  });

  if (!enrollment) {
    throw Object.assign(new Error("Enrollment not found"), { status: 404 });
  }

  if (!enrollment.certificate.issued || !enrollment.certificate.certificateUrl) {
    throw Object.assign(new Error("Certificate not yet issued"), { status: 400 });
  }

  const downloadUrl = await getPresignedDownloadUrl(
    enrollment.certificate.certificateUrl,
    3600
  );

  return { downloadUrl };
}
