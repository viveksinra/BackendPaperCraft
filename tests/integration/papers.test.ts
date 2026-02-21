import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock auth middleware
vi.mock("../../utils/auth", () => ({
  ensureAuth: (req: any, _res: any, next: any) => {
    req.auth = { sub: "test@test.com" };
    req.tenantId = "testTenant";
    next();
  },
}));

// Mock paper service
const mockCreatePaper = vi.fn();
const mockListPapers = vi.fn();
const mockGetPaperById = vi.fn();
const mockUpdatePaper = vi.fn();
const mockDeletePaper = vi.fn();
const mockAddQuestionsToSection = vi.fn();
const mockRemoveQuestionFromSection = vi.fn();
const mockReorderQuestionsInSection = vi.fn();
const mockSwapQuestion = vi.fn();
const mockFinalizePaper = vi.fn();
const mockPublishPaper = vi.fn();
const mockUnfinalizePaper = vi.fn();
const mockGetPaperPdfDownloadUrl = vi.fn();
const mockGetPaperStats = vi.fn();

vi.mock("../../src/services/paperService", () => ({
  createPaper: (...args: unknown[]) => mockCreatePaper(...args),
  listPapers: (...args: unknown[]) => mockListPapers(...args),
  getPaperById: (...args: unknown[]) => mockGetPaperById(...args),
  updatePaper: (...args: unknown[]) => mockUpdatePaper(...args),
  deletePaper: (...args: unknown[]) => mockDeletePaper(...args),
  addQuestionsToSection: (...args: unknown[]) => mockAddQuestionsToSection(...args),
  removeQuestionFromSection: (...args: unknown[]) => mockRemoveQuestionFromSection(...args),
  reorderQuestionsInSection: (...args: unknown[]) => mockReorderQuestionsInSection(...args),
  swapQuestion: (...args: unknown[]) => mockSwapQuestion(...args),
  finalizePaper: (...args: unknown[]) => mockFinalizePaper(...args),
  publishPaper: (...args: unknown[]) => mockPublishPaper(...args),
  unfinalizePaper: (...args: unknown[]) => mockUnfinalizePaper(...args),
  getPaperPdfDownloadUrl: (...args: unknown[]) => mockGetPaperPdfDownloadUrl(...args),
  getPaperStats: (...args: unknown[]) => mockGetPaperStats(...args),
}));

// Mock auto-generation service
const mockAutoGeneratePaper = vi.fn();
const mockGetSuggestedSwaps = vi.fn();

vi.mock("../../src/services/autoGenerationService", () => ({
  autoGeneratePaper: (...args: unknown[]) => mockAutoGeneratePaper(...args),
  getSuggestedSwaps: (...args: unknown[]) => mockGetSuggestedSwaps(...args),
}));

// Mock validation schemas
vi.mock("../../src/shared/validation/paperValidation", () => ({
  createPaperSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  updatePaperSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  autoGenerateSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  swapQuestionSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  addQuestionSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  removeQuestionSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  listPapersQuerySchema: {
    safeParse: (data: unknown) => ({ success: true, data: { ...data as object } }),
  },
}));

vi.mock("../../src/models/paper", () => ({
  PdfType: {},
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/papers`;

let app: ReturnType<typeof buildApp>;

describe("Papers API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /papers", () => {
    it("creates manual paper, returns 200", async () => {
      const paper = {
        _id: new mongoose.Types.ObjectId(),
        title: "Manual Paper",
        status: "draft",
        sections: [],
      };
      mockCreatePaper.mockResolvedValue(paper);

      const res = await request(app)
        .post(BASE)
        .send({
          title: "Manual Paper",
          templateId: new mongoose.Types.ObjectId().toString(),
          sections: [],
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paper.title).toBe("Manual Paper");
    });
  });

  describe("POST /papers/auto-generate", () => {
    it("generates draft from blueprint", async () => {
      const paper = {
        _id: new mongoose.Types.ObjectId(),
        title: "Auto Paper",
        status: "draft",
        sections: [{ name: "Section A", questions: [] }],
      };
      mockAutoGeneratePaper.mockResolvedValue(paper);

      const res = await request(app)
        .post(`${BASE}/auto-generate`)
        .send({
          blueprintId: new mongoose.Types.ObjectId().toString(),
          templateId: new mongoose.Types.ObjectId().toString(),
          title: "Auto Paper",
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paper.title).toBe("Auto Paper");
    });

    it("returns error for insufficient questions", async () => {
      mockAutoGeneratePaper.mockRejectedValue(
        Object.assign(new Error("Insufficient questions available"), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/auto-generate`)
        .send({
          blueprintId: new mongoose.Types.ObjectId().toString(),
          templateId: new mongoose.Types.ObjectId().toString(),
          title: "Auto Paper",
        })
        .expect(400);

      expect(res.body.message).toContain("Insufficient questions");
    });
  });

  describe("POST /papers/:id/sections/:idx/questions", () => {
    it("adds questions", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      const paper = {
        _id: paperId,
        sections: [{ name: "A", questions: [{ questionNumber: 1 }, { questionNumber: 2 }] }],
      };
      mockAddQuestionsToSection.mockResolvedValue(paper);

      const res = await request(app)
        .post(`${BASE}/${paperId}/sections/0/questions`)
        .send({ questionIds: [new mongoose.Types.ObjectId().toString()] })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockAddQuestionsToSection).toHaveBeenCalled();
    });

    it("returns 400 when questionIds not provided", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`${BASE}/${paperId}/sections/0/questions`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain("questionIds");
    });
  });

  describe("POST /papers/:id/swap-question", () => {
    it("swaps question in draft", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      const paper = { _id: paperId, status: "draft" };
      mockSwapQuestion.mockResolvedValue(paper);

      const res = await request(app)
        .post(`${BASE}/${paperId}/swap-question`)
        .send({
          sectionIndex: 0,
          questionNumber: 1,
          newQuestionId: new mongoose.Types.ObjectId().toString(),
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
    });

    it("rejects swap on finalized paper (400)", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockSwapQuestion.mockRejectedValue(
        Object.assign(new Error("Paper must be in draft status"), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/${paperId}/swap-question`)
        .send({
          sectionIndex: 0,
          questionNumber: 1,
          newQuestionId: new mongoose.Types.ObjectId().toString(),
        })
        .expect(400);

      expect(res.body.message).toContain("draft status");
    });
  });

  describe("POST /papers/:id/finalize", () => {
    it("finalizes and queues PDF job", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockFinalizePaper.mockResolvedValue({
        paper: { _id: paperId, status: "finalized" },
        jobId: "job-456",
      });

      const res = await request(app)
        .post(`${BASE}/${paperId}/finalize`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paper.status).toBe("finalized");
      expect(res.body.myData.jobId).toBe("job-456");
    });

    it("rejects empty paper (400)", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockFinalizePaper.mockRejectedValue(
        Object.assign(new Error("Paper must have at least one section"), { status: 400 })
      );

      const res = await request(app)
        .post(`${BASE}/${paperId}/finalize`)
        .expect(400);

      expect(res.body.message).toContain("at least one section");
    });
  });

  describe("PATCH /papers/:id", () => {
    it("blocks update on finalized paper (400)", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockUpdatePaper.mockRejectedValue(
        Object.assign(new Error("Paper must be in draft status"), { status: 400 })
      );

      const res = await request(app)
        .patch(`${BASE}/${paperId}`)
        .send({ title: "New Title" })
        .expect(400);

      expect(res.body.message).toContain("draft status");
    });
  });

  describe("POST /papers/:id/unfinalize", () => {
    it("reverts to draft", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      const paper = { _id: paperId, status: "draft" };
      mockUnfinalizePaper.mockResolvedValue(paper);

      const res = await request(app)
        .post(`${BASE}/${paperId}/unfinalize`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.paper.status).toBe("draft");
    });
  });

  describe("GET /papers/:id/download/:pdfType", () => {
    it("returns presigned URL for question_paper", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockGetPaperPdfDownloadUrl.mockResolvedValue("https://s3.example.com/presigned-url");

      const res = await request(app)
        .get(`${BASE}/${paperId}/download/question_paper`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.url).toContain("presigned-url");
    });

    it("rejects invalid PDF type", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .get(`${BASE}/${paperId}/download/invalid_type`)
        .expect(400);

      expect(res.body.message).toContain("Invalid PDF type");
    });
  });

  describe("DELETE /papers/:id", () => {
    it("deletes draft paper", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      mockDeletePaper.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${BASE}/${paperId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeletePaper).toHaveBeenCalledWith(COMPANY_ID, paperId);
    });
  });

  describe("GET /papers/stats", () => {
    it("returns correct aggregations", async () => {
      mockGetPaperStats.mockResolvedValue({
        total: 50,
        draft: 20,
        finalized: 25,
        published: 5,
      });

      const res = await request(app)
        .get(`${BASE}/stats`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.stats.total).toBe(50);
      expect(res.body.myData.stats.draft).toBe(20);
    });
  });
});
