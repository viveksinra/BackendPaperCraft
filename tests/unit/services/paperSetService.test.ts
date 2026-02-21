import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const mockPaperSetCreate = vi.fn();
const mockPaperSetFindOne = vi.fn();
const mockPaperSetFind = vi.fn();
const mockPaperSetCountDocuments = vi.fn();
const mockPaperSetDeleteOne = vi.fn();

const mockPaperFindOne = vi.fn();
const mockPaperFindById = vi.fn();

const mockDeleteS3Object = vi.fn();
const mockGetPresignedDownloadUrl = vi.fn();
const mockUploadPdfToS3 = vi.fn();

vi.mock("../../../src/models/paperSet", () => ({
  PaperSetModel: {
    create: (...args: unknown[]) => mockPaperSetCreate(...args),
    findOne: (...args: unknown[]) => mockPaperSetFindOne(...args),
    find: (...args: unknown[]) => {
      mockPaperSetFind(...args);
      return {
        sort: () => ({
          skip: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      };
    },
    countDocuments: (...args: unknown[]) => mockPaperSetCountDocuments(...args),
    deleteOne: (...args: unknown[]) => mockPaperSetDeleteOne(...args),
  },
  PaperSetStatus: {},
}));

vi.mock("../../../src/models/paper", () => ({
  PaperModel: {
    findOne: (...args: unknown[]) => mockPaperFindOne(...args),
    findById: (...args: unknown[]) => mockPaperFindById(...args),
  },
}));

vi.mock("../../../src/utils/s3", () => ({
  deleteS3Object: (...args: unknown[]) => mockDeleteS3Object(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  uploadPdfToS3: (...args: unknown[]) => mockUploadPdfToS3(...args),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

vi.mock("../../../src/shared/config/env", () => ({
  env: { AWS_BUCKET: "test-bucket" },
}));

import {
  createPaperSet,
  addPaperToSet,
  publishPaperSet,
  archivePaperSet,
  deletePaperSet,
} from "../../../src/services/paperSetService";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TENANT_ID = "testTenant";
const USER_EMAIL = "user@test.com";

function makePaperSetMock(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    companyId: new mongoose.Types.ObjectId(COMPANY_ID),
    title: "Test Paper Set",
    shortDescription: "Test desc",
    examType: "FSCE",
    status: "draft",
    papers: [],
    pricing: {},
    updatedBy: USER_EMAIL,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return doc;
}

describe("paperSetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPaperSet", () => {
    it("creates with default status draft", async () => {
      const mock = makePaperSetMock();
      mockPaperSetCreate.mockResolvedValue(mock);

      const result = await createPaperSet(COMPANY_ID, TENANT_ID, {
        title: "My Paper Set",
        examType: "FSCE",
      }, USER_EMAIL);

      expect(mockPaperSetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My Paper Set",
          status: "draft",
          createdBy: USER_EMAIL,
        })
      );
      expect(result).toBeDefined();
    });

    it("creates with default empty pricing", async () => {
      const mock = makePaperSetMock();
      mockPaperSetCreate.mockResolvedValue(mock);

      await createPaperSet(COMPANY_ID, TENANT_ID, {
        title: "Set",
      }, USER_EMAIL);

      expect(mockPaperSetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          pricing: {},
          papers: [],
        })
      );
    });
  });

  describe("addPaperToSet", () => {
    it("validates paper is finalized (rejects draft)", async () => {
      const paperSet = makePaperSetMock({ papers: [] });
      mockPaperSetFindOne.mockResolvedValue(paperSet);

      const draftPaper = {
        _id: new mongoose.Types.ObjectId(),
        status: "draft",
      };
      mockPaperFindOne.mockResolvedValue(draftPaper);

      await expect(
        addPaperToSet(
          COMPANY_ID,
          (paperSet._id as mongoose.Types.ObjectId).toString(),
          (draftPaper._id as mongoose.Types.ObjectId).toString(),
          USER_EMAIL
        )
      ).rejects.toThrow("Cannot add a draft paper to a set");
    });

    it("adds finalized paper with correct order", async () => {
      const papers: unknown[] = [];
      const paperSet = makePaperSetMock({ papers });
      mockPaperSetFindOne.mockResolvedValue(paperSet);

      const finalizedPaper = {
        _id: new mongoose.Types.ObjectId(),
        status: "finalized",
      };
      mockPaperFindOne.mockResolvedValue(finalizedPaper);

      const result = await addPaperToSet(
        COMPANY_ID,
        (paperSet._id as mongoose.Types.ObjectId).toString(),
        (finalizedPaper._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect((result as Record<string, unknown>).save).toHaveBeenCalled();
      expect((papers as Array<Record<string, unknown>>).length).toBe(1);
      expect((papers as Array<Record<string, unknown>>)[0].order).toBe(0);
    });

    it("throws 404 when paper set not found", async () => {
      mockPaperSetFindOne.mockResolvedValue(null);

      await expect(
        addPaperToSet(COMPANY_ID, new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString(), USER_EMAIL)
      ).rejects.toThrow("Paper set not found");
    });
  });

  describe("publishPaperSet", () => {
    it("validates all papers are finalized", async () => {
      const paperId = new mongoose.Types.ObjectId();
      const paperSet = makePaperSetMock({
        papers: [{ paperId, order: 0, pdfs: [] }],
      });
      mockPaperSetFindOne.mockResolvedValue(paperSet);

      // Paper is still draft
      mockPaperFindById.mockResolvedValue({ _id: paperId, status: "draft" });

      await expect(
        publishPaperSet(
          COMPANY_ID,
          (paperSet._id as mongoose.Types.ObjectId).toString(),
          USER_EMAIL
        )
      ).rejects.toThrow("All papers in the set must be finalized or published");
    });

    it("publishes when all papers are finalized", async () => {
      const paperId = new mongoose.Types.ObjectId();
      const paperSet = makePaperSetMock({
        papers: [{ paperId, order: 0, pdfs: [] }],
      });
      mockPaperSetFindOne.mockResolvedValue(paperSet);
      mockPaperFindById.mockResolvedValue({ _id: paperId, status: "finalized" });

      const result = await publishPaperSet(
        COMPANY_ID,
        (paperSet._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect((result as Record<string, unknown>).status).toBe("published");
      expect((result as Record<string, unknown>).save).toHaveBeenCalled();
    });
  });

  describe("archivePaperSet", () => {
    it("sets status to archived", async () => {
      const paperSet = makePaperSetMock({ status: "published" });
      mockPaperSetFindOne.mockResolvedValue(paperSet);

      const result = await archivePaperSet(
        COMPANY_ID,
        (paperSet._id as mongoose.Types.ObjectId).toString(),
        USER_EMAIL
      );

      expect((result as Record<string, unknown>).status).toBe("archived");
      expect((result as Record<string, unknown>).save).toHaveBeenCalled();
    });
  });

  describe("deletePaperSet", () => {
    it("blocks deletion of published paper sets", async () => {
      const paperSet = makePaperSetMock({ status: "published" });
      mockPaperSetFindOne.mockResolvedValue(paperSet);

      await expect(
        deletePaperSet(COMPANY_ID, (paperSet._id as mongoose.Types.ObjectId).toString())
      ).rejects.toThrow("Cannot delete a published paper set");
    });

    it("deletes draft paper set and cleans up S3", async () => {
      const paperSet = makePaperSetMock({
        status: "draft",
        papers: [
          {
            paperId: new mongoose.Types.ObjectId(),
            order: 0,
            pdfs: [{ s3Key: "test/key.pdf", fileName: "test.pdf" }],
          },
        ],
      });
      mockPaperSetFindOne.mockResolvedValue(paperSet);
      mockDeleteS3Object.mockResolvedValue(undefined);
      mockPaperSetDeleteOne.mockResolvedValue({});

      await deletePaperSet(COMPANY_ID, (paperSet._id as mongoose.Types.ObjectId).toString());

      expect(mockDeleteS3Object).toHaveBeenCalledWith("test/key.pdf");
      expect(mockPaperSetDeleteOne).toHaveBeenCalled();
    });
  });
});
