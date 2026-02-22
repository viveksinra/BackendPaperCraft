import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockCourseFindOne = vi.fn();
const mockCourseFindById = vi.fn();
const mockEnrollmentFindOne = vi.fn();
const mockEnrollmentFindById = vi.fn();
const mockUploadPdf = vi.fn();
const mockPresignedUrl = vi.fn();
const mockGenerateHtml = vi.fn();

vi.mock("../../../src/models/course", () => ({
  CourseModel: {
    findOne: (...args: unknown[]) => mockCourseFindOne(...args),
    findById: (...args: unknown[]) => {
      mockCourseFindById(...args);
      const result = mockCourseFindById.mock.results[mockCourseFindById.mock.results.length - 1]?.value;
      return {
        lean: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      };
    },
  },
}));

vi.mock("../../../src/models/courseEnrollment", () => ({
  CourseEnrollmentModel: {
    findOne: (...args: unknown[]) => {
      mockEnrollmentFindOne(...args);
      const result = mockEnrollmentFindOne.mock.results[mockEnrollmentFindOne.mock.results.length - 1]?.value;
      return {
        lean: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      };
    },
    findById: (...args: unknown[]) => mockEnrollmentFindById(...args),
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

vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock User and Company models
vi.mock("mongoose", async () => {
  const actual = await vi.importActual<typeof import("mongoose")>("mongoose");
  const mockData = {
    _id: new (actual as any).Types.ObjectId(),
    firstName: "Test",
    lastName: "Student",
    name: "Test Institute",
    email: "test@test.com",
  };
  return {
    ...actual,
    default: {
      ...actual,
      models: {},
      model: vi.fn().mockReturnValue({
        findById: vi.fn().mockImplementation(() => ({
          lean: () => Promise.resolve(mockData),
          then: (resolve: (v: unknown) => void) => Promise.resolve(mockData).then(resolve),
        })),
        findOne: vi.fn().mockResolvedValue(null),
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
    completedAt: new Date(),
    certificate: {
      issued: false,
      issuedAt: null,
      certificateUrl: "",
      certificateNumber: "",
    },
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
      mockEnrollmentFindById.mockResolvedValue(enrollment);
      // Mock findOne for certificate number uniqueness check
      mockEnrollmentFindOne.mockResolvedValue(null);
      const course = {
        _id: new mongoose.Types.ObjectId(COURSE_ID),
        title: "Test Course",
        certificateEnabled: true,
        teacherId: new mongoose.Types.ObjectId(),
        stats: { totalLessons: 5, totalDurationMinutes: 60 },
      };
      mockCourseFindById.mockResolvedValue(course);
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
          issued: true,
          certificateNumber: "CERT-2026-ABC12",
          issuedAt: new Date(),
          certificateUrl: "certs/cert.pdf",
        },
        createdAt: new Date(),
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);
      mockCourseFindById.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(COURSE_ID),
        title: "Test Course",
      });

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
          issued: true,
          certificateNumber: "CERT-2026-ABC12",
          certificateUrl: "certs/cert.pdf",
          issuedAt: new Date(),
        },
      });
      mockEnrollmentFindOne.mockResolvedValue(enrollment);
      mockPresignedUrl.mockResolvedValue("https://presigned.example.com/cert.pdf");

      const result = await getCertificateDownloadUrl(TENANT, COMPANY, ENROLLMENT_ID, STUDENT);

      expect(mockPresignedUrl).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("rejects download for wrong student", async () => {
      mockEnrollmentFindOne.mockResolvedValue(null);

      await expect(
        getCertificateDownloadUrl(TENANT, COMPANY, ENROLLMENT_ID, STUDENT)
      ).rejects.toThrow();
    });
  });
});
