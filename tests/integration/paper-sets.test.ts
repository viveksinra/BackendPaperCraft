import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Readable } from "stream";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "test@test.com" };
    req.tenantId = "testTenant";
    next();
  },
}));

// Mock paper set service
const mockCreatePaperSet = vi.fn();
const mockListPaperSets = vi.fn();
const mockGetPaperSetById = vi.fn();
const mockUpdatePaperSet = vi.fn();
const mockDeletePaperSet = vi.fn();
const mockAddPaperToSet = vi.fn();
const mockRemovePaperFromSet = vi.fn();
const mockUploadPaperSetPdf = vi.fn();
const mockDeletePaperSetPdf = vi.fn();
const mockPublishPaperSet = vi.fn();
const mockArchivePaperSet = vi.fn();
const mockDownloadPaperSetAsZip = vi.fn();

vi.mock("../../src/services/paperSetService", () => ({
  createPaperSet: (...args: unknown[]) => mockCreatePaperSet(...args),
  listPaperSets: (...args: unknown[]) => mockListPaperSets(...args),
  getPaperSetById: (...args: unknown[]) => mockGetPaperSetById(...args),
  updatePaperSet: (...args: unknown[]) => mockUpdatePaperSet(...args),
  deletePaperSet: (...args: unknown[]) => mockDeletePaperSet(...args),
  addPaperToSet: (...args: unknown[]) => mockAddPaperToSet(...args),
  removePaperFromSet: (...args: unknown[]) => mockRemovePaperFromSet(...args),
  uploadPaperSetPdf: (...args: unknown[]) => mockUploadPaperSetPdf(...args),
  deletePaperSetPdf: (...args: unknown[]) => mockDeletePaperSetPdf(...args),
  publishPaperSet: (...args: unknown[]) => mockPublishPaperSet(...args),
  archivePaperSet: (...args: unknown[]) => mockArchivePaperSet(...args),
  downloadPaperSetAsZip: (...args: unknown[]) => mockDownloadPaperSetAsZip(...args),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/paperSetValidation", () => ({
  createPaperSetSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  updatePaperSetSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  addPaperToSetSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  listPaperSetsQuerySchema: {
    safeParse: (data: unknown) => ({ success: true, data: { ...data as object } }),
  },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/paper-sets`;

let app: ReturnType<typeof buildApp>;

describe("Paper Sets API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /paper-sets", () => {
    it("creates paper set", async () => {
      const paperSet = {
        _id: new mongoose.Types.ObjectId(),
        title: "Mock Exam Bundle",
        status: "draft",
        papers: [],
      };
      mockCreatePaperSet.mockResolvedValue(paperSet);

      const res = await request(app)
        .post(BASE)
        .send({ title: "Mock Exam Bundle", examType: "FSCE" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paperSet.title).toBe("Mock Exam Bundle");
    });
  });

  describe("POST /paper-sets/:id/papers", () => {
    it("adds finalized paper to set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const paperId = new mongoose.Types.ObjectId().toString();
      const paperSet = {
        _id: setId,
        papers: [{ paperId, order: 0, pdfs: [] }],
      };
      mockAddPaperToSet.mockResolvedValue(paperSet);

      const res = await request(app)
        .post(`${BASE}/${setId}/papers`)
        .send({ paperId })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paperSet.papers).toHaveLength(1);
    });

    it("rejects draft paper (400)", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const paperId = new mongoose.Types.ObjectId().toString();
      mockAddPaperToSet.mockRejectedValue(
        Object.assign(new Error("Cannot add a draft paper to a set. Finalize it first."), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/${setId}/papers`)
        .send({ paperId })
        .expect(400);

      expect(res.body.message).toContain("Cannot add a draft paper");
    });
  });

  describe("POST /paper-sets/:id/publish", () => {
    it("publishes set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const paperSet = { _id: setId, status: "published" };
      mockPublishPaperSet.mockResolvedValue(paperSet);

      const res = await request(app)
        .post(`${BASE}/${setId}/publish`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paperSet.status).toBe("published");
    });

    it("rejects if papers not finalized (400)", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      mockPublishPaperSet.mockRejectedValue(
        Object.assign(
          new Error("All papers in the set must be finalized or published before publishing the set"),
          { status: 400 }
        )
      );

      const res = await request(app)
        .post(`${BASE}/${setId}/publish`)
        .expect(400);

      expect(res.body.message).toContain("must be finalized or published");
    });
  });

  describe("POST /paper-sets/:id/archive", () => {
    it("archives set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const paperSet = { _id: setId, status: "archived" };
      mockArchivePaperSet.mockResolvedValue(paperSet);

      const res = await request(app)
        .post(`${BASE}/${setId}/archive`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paperSet.status).toBe("archived");
    });
  });

  describe("DELETE /paper-sets/:id", () => {
    it("deletes draft paper set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      mockDeletePaperSet.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${BASE}/${setId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
    });

    it("rejects deletion of published set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      mockDeletePaperSet.mockRejectedValue(
        Object.assign(new Error("Cannot delete a published paper set. Archive it first."), { status: 400 })
      );

      const res = await request(app)
        .delete(`${BASE}/${setId}`)
        .expect(400);

      expect(res.body.message).toContain("Cannot delete a published paper set");
    });
  });

  describe("GET /paper-sets/:id/download-zip", () => {
    it("streams ZIP file with correct content-type", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const mockStream = new Readable({
        read() {
          this.push(Buffer.from("PK\x03\x04")); // ZIP magic bytes
          this.push(null);
        },
      });
      mockDownloadPaperSetAsZip.mockResolvedValue(mockStream);

      const res = await request(app)
        .get(`${BASE}/${setId}/download-zip`)
        .expect(200);

      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["content-disposition"]).toContain(`paper-set-${setId}.zip`);
    });
  });

  describe("POST /paper-sets/:id/upload-pdf", () => {
    it("returns placeholder error (multer not configured)", async () => {
      const setId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`${BASE}/${setId}/upload-pdf`)
        .expect(400);

      expect(res.body.message).toContain("File upload not yet configured");
    });
  });

  describe("DELETE /paper-sets/:id/pdfs/:pdfIndex", () => {
    it("deletes PDF from paper set", async () => {
      const setId = new mongoose.Types.ObjectId().toString();
      const paperSet = { _id: setId, papers: [{ pdfs: [] }] };
      mockDeletePaperSetPdf.mockResolvedValue(paperSet);

      const res = await request(app)
        .delete(`${BASE}/${setId}/pdfs/0`)
        .send({ paperIndex: 0 })
        .expect(200);

      expect(res.body.variant).toBe("success");
    });
  });
});
