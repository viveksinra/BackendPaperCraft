import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
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

// Mock the service layer
const mockCreateTemplate = vi.fn();
const mockListTemplates = vi.fn();
const mockGetTemplateById = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockCloneTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();

vi.mock("../../src/services/paperTemplateService", () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
  cloneTemplate: (...args: unknown[]) => mockCloneTemplate(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
}));

// Mock validation schemas to pass through
vi.mock("../../src/shared/validation/paperTemplateValidation", () => ({
  createPaperTemplateSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  updatePaperTemplateSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/paper-templates`;

let app: ReturnType<typeof buildApp>;

describe("Paper Templates API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /paper-templates", () => {
    it("creates template, returns 200", async () => {
      const template = {
        _id: new mongoose.Types.ObjectId(),
        name: "My Template",
        isPreBuilt: false,
        isActive: true,
      };
      mockCreateTemplate.mockResolvedValue(template);

      const res = await request(app)
        .post(BASE)
        .send({ name: "My Template", layout: { header: { title: "Test" } } })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.template).toBeDefined();
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        COMPANY_ID,
        "testTenant",
        expect.objectContaining({ name: "My Template" }),
        "test@test.com"
      );
    });
  });

  describe("GET /paper-templates", () => {
    it("lists templates including pre-built", async () => {
      const templates = [
        { _id: new mongoose.Types.ObjectId(), name: "Pre-Built", isPreBuilt: true },
        { _id: new mongoose.Types.ObjectId(), name: "Custom", isPreBuilt: false },
      ];
      mockListTemplates.mockResolvedValue(templates);

      const res = await request(app)
        .get(BASE)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.templates).toHaveLength(2);
    });

    it("passes search query to service", async () => {
      mockListTemplates.mockResolvedValue([]);

      await request(app)
        .get(`${BASE}?search=FSCE`)
        .expect(200);

      expect(mockListTemplates).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ search: "FSCE" })
      );
    });
  });

  describe("PATCH /paper-templates/:id", () => {
    it("updates custom template", async () => {
      const templateId = new mongoose.Types.ObjectId().toString();
      const updated = { _id: templateId, name: "Updated Name", isPreBuilt: false };
      mockUpdateTemplate.mockResolvedValue(updated);

      const res = await request(app)
        .patch(`${BASE}/${templateId}`)
        .send({ name: "Updated Name" })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.template.name).toBe("Updated Name");
    });

    it("blocks update on pre-built (returns 400)", async () => {
      const templateId = new mongoose.Types.ObjectId().toString();
      mockUpdateTemplate.mockRejectedValue(
        Object.assign(new Error("Cannot modify a pre-built template"), { status: 400 })
      );

      const res = await request(app)
        .patch(`${BASE}/${templateId}`)
        .send({ name: "Changed" })
        .expect(400);

      expect(res.body.variant).toBe("error");
      expect(res.body.message).toContain("Cannot modify a pre-built template");
    });
  });

  describe("POST /paper-templates/:id/clone", () => {
    it("clones pre-built template", async () => {
      const templateId = new mongoose.Types.ObjectId().toString();
      const cloned = {
        _id: new mongoose.Types.ObjectId(),
        name: "FSCE Mock (Custom)",
        isPreBuilt: false,
      };
      mockCloneTemplate.mockResolvedValue(cloned);

      const res = await request(app)
        .post(`${BASE}/${templateId}/clone`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.template.name).toBe("FSCE Mock (Custom)");
      expect(res.body.myData.template.isPreBuilt).toBe(false);
    });
  });

  describe("DELETE /paper-templates/:id", () => {
    it("soft-deletes custom template", async () => {
      const templateId = new mongoose.Types.ObjectId().toString();
      mockDeleteTemplate.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${BASE}/${templateId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteTemplate).toHaveBeenCalledWith(COMPANY_ID, templateId);
    });

    it("returns error when deleting pre-built", async () => {
      const templateId = new mongoose.Types.ObjectId().toString();
      mockDeleteTemplate.mockRejectedValue(
        Object.assign(new Error("Cannot delete a pre-built template"), { status: 400 })
      );

      const res = await request(app)
        .delete(`${BASE}/${templateId}`)
        .expect(400);

      expect(res.body.message).toContain("Cannot delete a pre-built template");
    });
  });
});
