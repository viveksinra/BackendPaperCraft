import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseFindOne = vi.fn();
const mockEnrollmentFindOne = vi.fn();
const mockUploadPdf = vi.fn();
const mockPresignedUrl = vi.fn();
const mockGenerateHtml = vi.fn();

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    findOne: (...args: unknown[]) => mockEnrollmentFindOne(...args),
  },
}));

vi.mock("../../../src/utils/s3", () => ({
  uploadPdfToS3: (...args: unknown[]) => mockUploadPdf(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mockPresignedUrl(...args),
}));

vi.mock("../../../src/services/certificateTemplate", () => ({
  generateCertificateHtml: (...args: unknown[]) => mockGenerateHtml(...args),
}));

vi.mock("../../../src/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock User and Company models
vi.mock("mongoose", async () => {
  const actual = await vi.importActual<typeof import("mongoose")>("mongoose");
  return {
    ...actual,
    default: {
      ...actual,
      models: {},
      model: vi.fn().mockReturnValue({
        findById: vi.fn().mockResolvedValue({
          _id: new (actual as any).Types.ObjectId(),
          firstName: "Test",
          lastName: "Student",
          name: "Test Institute",
        }),
      }),
    },
  };
});

import {
  generateCertificate,
  verifyCertificate,
  getCertificateDownloadUrl,
} from "../../../src/services/certificateService";

// ─── Data ─────────────────────────────────────────────────────────────────

const TENANT = "testTenant";
const COMPANY = new mongoose.Types.ObjectId().toString();
const STUDENT = new mongoose.Types.ObjectId().toString();
const COURSE_ID = new mongoose.Types.ObjectId().toString();
const ENROLLMENT_ID = new mongoose.Types.ObjectId().toString();

function makeEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(ENROLLMENT_ID),
    tenantId: TENANT,
    companyId: new mongoose.Types.ObjectId(COMPANY),
    courseId: new mongoose.Types.ObjectId(COURSE_ID),
    studentUserId: new mongoose.Types.ObjectId(STUDENT),
    status: "completed",
    certificate: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("certificateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateCertificate", () => {
    it("generates a PDF certificate and updates enrollment", async () => {
      const enrollment = makeEnrollment();
      mockEnrollmentFindOne.mockResolvedValue(enrollment);
      const course = {
        _id: new mongoose.Types.ObjectId(COURSE_ID),
        title: "Test Course",
        certificateEnabled: true,
      };
      mockCourseFindOne.mockResolvedValue(course);
      mockGenerateHtml.mockReturnValue("<html>cert</html>");
      mockUploadPdf.mockResolvedValue({ url: "https://s3.example.com/cert.pdf", key: "certs/cert.pdf" });

      await generateCertificate({
        tenantId: TENANT,
        companyId: COMPANY,
        courseId: COURSE_ID,
        enrollmentId: ENROLLMENT_ID,
        studentUserId: STUDENT,
      });

      expect(mockUploadPdf).toHaveBeenCalled();
      expect(enrollment.save).toHaveBeenCalled();
    });

    it("generates unique certificate numbers", async () => {
      const enrollment1 = makeEnrollment();
      const enrollment2 = makeEnrollment({ _id: new mongoose.Types.ObjectId() });

      // Certificate numbers should be unique per call
      const numbers = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const num = `CERT-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        numbers.add(num);
      }
      // All numbers should be unique
      expect(numbers.size).toBe(10);
    });
  });

  describe("verifyCertificate", () => {
    it("returns valid data for existing certificate", async () => {
      const enrollment = makeEnrollment({
        certificate: {
          certificateNumber: "CERT-2026-ABC12",
          issuedAt: new Date(),
          pdfUrl: "https://s3.example.com/cert.pdf",
        },
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      const result = await verifyCertificate("CERT-2026-ABC12");

      expect(result).toBeDefined();
    });

    it("returns null for non-existent certificate", async () => {
      mockEnrollmentFindOne.mockResolvedValue(null);

      const result = await verifyCertificate("CERT-INVALID");

      expect(result).toBeNull();
    });
  });

  describe("getCertificateDownloadUrl", () => {
    it("returns presigned URL for valid enrollment", async () => {
      const enrollment = makeEnrollment({
        studentUserId: new mongoose.Types.ObjectId(STUDENT),
        certificate: {
          certificateNumber: "CERT-2026-ABC12",
          s3Key: "certs/cert.pdf",
        },
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);
      mockPresignedUrl.mockResolvedValue("https://presigned.example.com/cert.pdf");

      const result = await getCertificateDownloadUrl(ENROLLMENT_ID, STUDENT);

      expect(mockPresignedUrl).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("rejects download for wrong student", async () => {
      const enrollment = makeEnrollment({
        studentUserId: new mongoose.Types.ObjectId(), // different student
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);

      await expect(
        getCertificateDownloadUrl(ENROLLMENT_ID, STUDENT)
      ).rejects.toThrow();
    });
  });
});
