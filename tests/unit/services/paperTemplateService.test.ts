import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Mock the model before importing the service
const mockCreate = vi.fn();
const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockSort = vi.fn();

vi.mock("../../../src/models/paperTemplate", () => ({
  PaperTemplateModel: {
    create: (...args: unknown[]) => mockCreate(...args),
    find: (...args: unknown[]) => {
      mockFind(...args);
      return { sort: mockSort };
    },
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

import {
  createTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  cloneTemplate,
  deleteTemplate,
} from "../../../src/services/paperTemplateService";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const TENANT_ID = "testTenant";
const USER_EMAIL = "user@test.com";

function makeTemplateMock(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    companyId: new mongoose.Types.ObjectId(COMPANY_ID),
    name: "Test Template",
    description: "",
    layout: {},
    isPreBuilt: false,
    isActive: true,
    createdBy: USER_EMAIL,
    updatedBy: USER_EMAIL,
    set: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    toObject: vi.fn().mockReturnThis(),
    ...overrides,
  };
  doc.toObject = vi.fn().mockReturnValue({
    _id: doc._id,
    tenantId: doc.tenantId,
    name: doc.name,
    layout: doc.layout,
    isPreBuilt: doc.isPreBuilt,
    isActive: doc.isActive,
  });
  return doc;
}

describe("paperTemplateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTemplate", () => {
    it("creates with valid layout and isPreBuilt: false", async () => {
      const mock = makeTemplateMock();
      mockCreate.mockResolvedValue(mock);

      const result = await createTemplate(COMPANY_ID, TENANT_ID, {
        name: "My Template",
        layout: { header: { title: "Test" } },
      }, USER_EMAIL);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Template",
          isPreBuilt: false,
          isActive: true,
          tenantId: TENANT_ID,
          createdBy: USER_EMAIL,
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe("listTemplates", () => {
    it("returns both pre-built and custom templates", async () => {
      const templates = [makeTemplateMock({ isPreBuilt: true }), makeTemplateMock()];
      mockSort.mockResolvedValue(templates);

      const result = await listTemplates(COMPANY_ID);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          $or: expect.any(Array),
        })
      );
      expect(result).toHaveLength(2);
    });

    it("filters by search keyword", async () => {
      mockSort.mockResolvedValue([]);

      await listTemplates(COMPANY_ID, { search: "FSCE" });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          name: { $regex: "FSCE", $options: "i" },
        })
      );
    });
  });

  describe("updateTemplate", () => {
    it("blocks updates on pre-built templates", async () => {
      const preBuilt = makeTemplateMock({ isPreBuilt: true });
      mockFindOne.mockResolvedValue(preBuilt);

      await expect(
        updateTemplate(COMPANY_ID, preBuilt._id.toString(), { name: "Changed" }, USER_EMAIL)
      ).rejects.toThrow("Cannot modify a pre-built template");
    });

    it("allows updates on custom templates", async () => {
      const custom = makeTemplateMock({ isPreBuilt: false });
      mockFindOne.mockResolvedValue(custom);

      const result = await updateTemplate(
        COMPANY_ID, custom._id.toString(), { name: "Updated" }, USER_EMAIL
      );

      expect(custom.save).toHaveBeenCalled();
      expect(result.name).toBe("Updated");
    });
  });

  describe("cloneTemplate", () => {
    it('deep copies and sets isPreBuilt: false, appends " (Custom)"', async () => {
      const source = makeTemplateMock({ isPreBuilt: true, name: "FSCE Mock" });
      mockFindOne.mockResolvedValue(source);
      const cloned = makeTemplateMock({ name: "FSCE Mock (Custom)" });
      mockCreate.mockResolvedValue(cloned);

      const result = await cloneTemplate(COMPANY_ID, source._id.toString(), USER_EMAIL);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "FSCE Mock (Custom)",
          isPreBuilt: false,
          isActive: true,
        })
      );
      expect(result.name).toBe("FSCE Mock (Custom)");
    });
  });

  describe("deleteTemplate", () => {
    it("blocks deletion of pre-built templates", async () => {
      const preBuilt = makeTemplateMock({ isPreBuilt: true });
      mockFindOne.mockResolvedValue(preBuilt);

      await expect(
        deleteTemplate(COMPANY_ID, preBuilt._id.toString())
      ).rejects.toThrow("Cannot delete a pre-built template");
    });

    it("soft-deletes custom templates by setting isActive: false", async () => {
      const custom = makeTemplateMock({ isPreBuilt: false });
      mockFindOne.mockResolvedValue(custom);

      await deleteTemplate(COMPANY_ID, custom._id.toString());

      expect(custom.isActive).toBe(false);
      expect(custom.save).toHaveBeenCalled();
    });
  });
});
