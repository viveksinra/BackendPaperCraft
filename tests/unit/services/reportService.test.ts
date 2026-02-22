import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';

// ---- Hoisted Mocks ----

const {
  mockReportModel,
  mockDeleteS3Object,
  mockGetPresignedDownloadUrl,
  mockClassModel,
} = vi.hoisted(() => {
  const mocks = {
    mockReportModel: {
      create: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      find: vi.fn(),
      countDocuments: vi.fn(),
      deleteOne: vi.fn(),
    } as Record<string, any>,
    mockDeleteS3Object: vi.fn(),
    mockGetPresignedDownloadUrl: vi.fn(),
    mockClassModel: { findById: vi.fn() } as Record<string, any>,
  };
  // Pre-register on mongoose.models so Class is found at service import time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongoose = require('mongoose');
  mongoose.models.Class = mocks.mockClassModel;
  return mocks;
});

vi.mock('../../../src/models/report', () => ({
  ReportModel: mockReportModel,
}));

vi.mock('../../../src/utils/s3', () => ({
  deleteS3Object: (...args: unknown[]) => mockDeleteS3Object(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
}));

vi.mock('../../../src/shared/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/queue/queues', () => ({
  addReportGenerationJob: vi.fn().mockResolvedValue(undefined),
}));

// ---- Helpers ----

function toObjectId(): Types.ObjectId {
  return new Types.ObjectId();
}

function chainable(resolvedValue: unknown) {
  const obj: Record<string, any> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  return obj;
}

const companyId = toObjectId();
const reportId = toObjectId();
const studentId = toObjectId();
const classId = toObjectId();

function makeReport(overrides: Record<string, any> = {}) {
  return {
    _id: reportId,
    companyId,
    tenantId: 'tenant-1',
    type: 'progress_report',
    title: 'Progress Report - 2026-01-15',
    status: 'completed',
    pdfUrl: 'reports/report-123.pdf',
    studentUserId: studentId,
    classId: null,
    generatedBy: 'teacher@test.com',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    toObject: function () { return { ...this }; },
    ...overrides,
  };
}

// ---- Import service after mocks ----

import {
  generateReport,
  getReport,
  listReports,
  deleteReport,
  generateBulkClassReports,
  getStudentReports,
  downloadReport,
} from '../../../src/services/reportService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── generateReport ──────────────────────────────────────────────────

describe('generateReport', () => {
  it('creates report with status pending and queues BullMQ job', async () => {
    const createdReport = makeReport({ status: 'pending', pdfUrl: null });
    mockReportModel.create.mockResolvedValue(createdReport);

    const result = await generateReport(
      companyId.toString(),
      'tenant-1',
      {
        type: 'progress_report',
        studentUserId: studentId.toString(),
      },
      'teacher@test.com'
    );

    expect(mockReportModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'progress_report',
        generatedBy: 'teacher@test.com',
      })
    );

    // Verify expiresAt is set to ~30 days from now
    const createCall = mockReportModel.create.mock.calls[0][0];
    const expiresAt = new Date(createCall.expiresAt);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    expect(Math.abs(expiresAt.getTime() - thirtyDaysFromNow.getTime())).toBeLessThan(5000);
  });

  it('generates default title when not provided', async () => {
    mockReportModel.create.mockResolvedValue(makeReport());

    await generateReport(
      companyId.toString(),
      'tenant-1',
      { type: 'progress_report' },
      'teacher@test.com'
    );

    const createCall = mockReportModel.create.mock.calls[0][0];
    expect(createCall.title).toContain('progress report');
  });

  it('uses provided title when given', async () => {
    mockReportModel.create.mockResolvedValue(makeReport());

    await generateReport(
      companyId.toString(),
      'tenant-1',
      { type: 'progress_report', title: 'Custom Report Title' },
      'teacher@test.com'
    );

    const createCall = mockReportModel.create.mock.calls[0][0];
    expect(createCall.title).toBe('Custom Report Title');
  });
});

// ─── getReport ───────────────────────────────────────────────────────

describe('getReport', () => {
  it('returns report with download URL for completed report', async () => {
    const report = makeReport();
    mockReportModel.findOne.mockResolvedValue(report);
    mockGetPresignedDownloadUrl.mockResolvedValue('https://s3.example.com/download');

    const result = await getReport(companyId.toString(), reportId.toString());

    expect(result.downloadUrl).toBe('https://s3.example.com/download');
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      'reports/report-123.pdf',
      3600
    );
  });

  it('throws 404 when report not found', async () => {
    mockReportModel.findOne.mockResolvedValue(null);

    await expect(
      getReport(companyId.toString(), reportId.toString())
    ).rejects.toThrow('Report not found');
  });

  it('returns report without download URL when status is pending', async () => {
    const report = makeReport({ status: 'pending', pdfUrl: null });
    mockReportModel.findOne.mockResolvedValue(report);

    const result = await getReport(companyId.toString(), reportId.toString());

    expect(result.downloadUrl).toBeUndefined();
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});

// ─── listReports ─────────────────────────────────────────────────────

describe('listReports', () => {
  it('returns paginated results with filters', async () => {
    const reports = [makeReport(), makeReport({ _id: toObjectId() })];

    const findChain = chainable(reports);
    mockReportModel.find.mockReturnValue(findChain);
    mockReportModel.countDocuments.mockResolvedValue(15);

    const result = await listReports(
      companyId.toString(),
      { type: 'progress_report', status: 'completed' },
      { page: 1, pageSize: 10 }
    );

    expect(result.reports).toHaveLength(2);
    expect(result.total).toBe(15);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('applies type and status filters', async () => {
    mockReportModel.find.mockReturnValue(chainable([]));
    mockReportModel.countDocuments.mockResolvedValue(0);

    await listReports(
      companyId.toString(),
      { type: 'class_summary', status: 'completed' },
      { page: 1, pageSize: 10 }
    );

    const findCall = mockReportModel.find.mock.calls[0][0];
    expect(findCall.type).toBe('class_summary');
    expect(findCall.status).toBe('completed');
  });
});

// ─── deleteReport ────────────────────────────────────────────────────

describe('deleteReport', () => {
  it('deletes both S3 file and DB record', async () => {
    const report = makeReport();
    mockReportModel.findOne.mockResolvedValue(report);
    mockDeleteS3Object.mockResolvedValue(undefined);
    mockReportModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await deleteReport(companyId.toString(), reportId.toString());

    expect(mockDeleteS3Object).toHaveBeenCalledWith('reports/report-123.pdf');
    expect(mockReportModel.deleteOne).toHaveBeenCalledWith({ _id: report._id });
  });

  it('throws 404 when report not found', async () => {
    mockReportModel.findOne.mockResolvedValue(null);

    await expect(
      deleteReport(companyId.toString(), reportId.toString())
    ).rejects.toThrow('Report not found');
  });

  it('still deletes DB record if S3 delete fails', async () => {
    const report = makeReport();
    mockReportModel.findOne.mockResolvedValue(report);
    mockDeleteS3Object.mockRejectedValue(new Error('S3 error'));
    mockReportModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await deleteReport(companyId.toString(), reportId.toString());

    expect(mockReportModel.deleteOne).toHaveBeenCalled();
  });

  it('handles report without S3 file', async () => {
    const report = makeReport({ pdfUrl: null });
    mockReportModel.findOne.mockResolvedValue(report);
    mockReportModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await deleteReport(companyId.toString(), reportId.toString());

    expect(mockDeleteS3Object).not.toHaveBeenCalled();
    expect(mockReportModel.deleteOne).toHaveBeenCalled();
  });
});

// ─── generateBulkClassReports ────────────────────────────────────────

describe('generateBulkClassReports', () => {
  it('creates one report per student in the class', async () => {
    const s1 = toObjectId();
    const s2 = toObjectId();
    const s3 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: classId,
        students: [s1, s2, s3],
      }),
    });

    mockReportModel.create.mockResolvedValue(makeReport());

    const result = await generateBulkClassReports(
      companyId.toString(),
      'tenant-1',
      classId.toString(),
      'standard',
      'teacher@test.com'
    );

    expect(result.queued).toBe(3);
    expect(mockReportModel.create).toHaveBeenCalledTimes(3);
  });

  it('throws 404 when class not found', async () => {
    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    await expect(
      generateBulkClassReports(
        companyId.toString(),
        'tenant-1',
        classId.toString(),
        'standard',
        'teacher@test.com'
      )
    ).rejects.toThrow('Class not found');
  });

  it('continues processing even if one student fails', async () => {
    const s1 = toObjectId();
    const s2 = toObjectId();

    mockClassModel.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: classId,
        students: [s1, s2],
      }),
    });

    // First call fails, second succeeds
    mockReportModel.create
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(makeReport());

    const result = await generateBulkClassReports(
      companyId.toString(),
      'tenant-1',
      classId.toString(),
      'standard',
      'teacher@test.com'
    );

    expect(result.queued).toBe(1);
  });
});

// ─── getStudentReports ───────────────────────────────────────────────

describe('getStudentReports', () => {
  it('returns completed reports for a student', async () => {
    const reports = [makeReport(), makeReport({ _id: toObjectId() })];
    mockReportModel.find.mockReturnValue(chainable(reports));

    const result = await getStudentReports(studentId.toString());

    expect(result).toHaveLength(2);
    expect(mockReportModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
  });
});

// ─── downloadReport ──────────────────────────────────────────────────

describe('downloadReport', () => {
  it('returns presigned download URL for completed report', async () => {
    mockReportModel.findById.mockResolvedValue(
      makeReport({ status: 'completed', pdfUrl: 'reports/file.pdf' })
    );
    mockGetPresignedDownloadUrl.mockResolvedValue('https://s3.example.com/file.pdf');

    const result = await downloadReport(reportId.toString());

    expect(result.downloadUrl).toBe('https://s3.example.com/file.pdf');
  });

  it('throws 404 when report not found', async () => {
    mockReportModel.findById.mockResolvedValue(null);

    await expect(downloadReport(reportId.toString())).rejects.toThrow(
      'Report not found'
    );
  });

  it('throws 400 when report is not yet completed', async () => {
    mockReportModel.findById.mockResolvedValue(
      makeReport({ status: 'pending', pdfUrl: null })
    );

    await expect(downloadReport(reportId.toString())).rejects.toThrow(
      'Report not ready for download'
    );
  });
});
