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

// Mock the service layer
const mockCreateBlueprint = vi.fn();
const mockListBlueprints = vi.fn();
const mockGetBlueprintById = vi.fn();
const mockUpdateBlueprint = vi.fn();
const mockCloneBlueprint = vi.fn();
const mockDeleteBlueprint = vi.fn();
const mockValidateBlueprintFeasibility = vi.fn();

vi.mock("../../src/services/paperBlueprintService", () => ({
  createBlueprint: (...args: unknown[]) => mockCreateBlueprint(...args),
  listBlueprints: (...args: unknown[]) => mockListBlueprints(...args),
  getBlueprintById: (...args: unknown[]) => mockGetBlueprintById(...args),
  updateBlueprint: (...args: unknown[]) => mockUpdateBlueprint(...args),
  cloneBlueprint: (...args: unknown[]) => mockCloneBlueprint(...args),
  deleteBlueprint: (...args: unknown[]) => mockDeleteBlueprint(...args),
  validateBlueprintFeasibility: (...args: unknown[]) => mockValidateBlueprintFeasibility(...args),
}));

// Mock validation schemas
const mockCreateSchema = vi.fn();
const mockUpdateSchema = vi.fn();

vi.mock("../../src/shared/validation/paperBlueprintValidation", () => ({
  createPaperBlueprintSchema: {
    safeParse: (data: unknown) => mockCreateSchema(data),
  },
  updatePaperBlueprintSchema: {
    safeParse: (data: unknown) => mockUpdateSchema(data),
  },
}));

import { buildApp } from "../../src/api/server";

const COMPANY_ID = new mongoose.Types.ObjectId().toString();
const BASE = `/api/v2/companies/${COMPANY_ID}/paper-blueprints`;

let app: ReturnType<typeof buildApp>;

describe("Paper Blueprints API", () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: validation passes
    mockCreateSchema.mockImplementation((data) => ({ success: true, data }));
    mockUpdateSchema.mockImplementation((data) => ({ success: true, data }));
  });

  describe("POST /paper-blueprints", () => {
    it("creates blueprint, returns 200", async () => {
      const blueprint = {
        _id: new mongoose.Types.ObjectId(),
        name: "Math Blueprint",
        sections: [{ name: "Section A", questionCount: 10, questionTypes: ["mcq"] }],
      };
      mockCreateBlueprint.mockResolvedValue(blueprint);

      const res = await request(app)
        .post(BASE)
        .send({
          name: "Math Blueprint",
          totalMarks: 100,
          totalTime: 60,
          sections: [{ name: "Section A", questionCount: 10, questionTypes: ["mcq"] }],
        })
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.blueprint).toBeDefined();
    });

    it("rejects invalid difficulty mix (returns 400)", async () => {
      // Simulate Zod validation failure
      mockCreateSchema.mockReturnValue({
        success: false,
        error: {
          issues: [{ message: "Difficulty mix percentages must sum to 100" }],
        },
      });

      const res = await request(app)
        .post(BASE)
        .send({
          name: "Bad Blueprint",
          sections: [{
            name: "Section A",
            questionCount: 10,
            questionTypes: ["mcq"],
            difficultyMix: { easy: 10, medium: 20, hard: 30, expert: 10 }, // = 70, not 100
          }],
        })
        .expect(400);

      expect(res.body.message).toContain("Difficulty mix percentages must sum to 100");
    });
  });

  describe("GET /paper-blueprints/:id/validate", () => {
    it("returns feasibility report", async () => {
      const blueprintId = new mongoose.Types.ObjectId().toString();
      const feasibility = {
        feasible: false,
        sections: [
          { name: "Section A", required: 10, available: 15, shortfall: 0 },
          { name: "Section B", required: 5, available: 2, shortfall: 3 },
        ],
      };
      mockValidateBlueprintFeasibility.mockResolvedValue(feasibility);

      const res = await request(app)
        .get(`${BASE}/${blueprintId}/validate`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.feasibility.feasible).toBe(false);
      expect(res.body.myData.feasibility.sections).toHaveLength(2);
      expect(res.body.myData.feasibility.sections[1].shortfall).toBe(3);
    });
  });

  describe("POST /paper-blueprints/:id/clone", () => {
    it("clones blueprint", async () => {
      const blueprintId = new mongoose.Types.ObjectId().toString();
      const cloned = {
        _id: new mongoose.Types.ObjectId(),
        name: "Math Blueprint (Custom)",
        isPreBuilt: false,
      };
      mockCloneBlueprint.mockResolvedValue(cloned);

      const res = await request(app)
        .post(`${BASE}/${blueprintId}/clone`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(res.body.myData.blueprint.name).toBe("Math Blueprint (Custom)");
    });
  });

  describe("PATCH /paper-blueprints/:id", () => {
    it("blocks update on pre-built", async () => {
      const blueprintId = new mongoose.Types.ObjectId().toString();
      mockUpdateBlueprint.mockRejectedValue(
        Object.assign(new Error("Cannot modify a pre-built blueprint"), { status: 400 })
      );

      const res = await request(app)
        .patch(`${BASE}/${blueprintId}`)
        .send({ name: "Changed" })
        .expect(400);

      expect(res.body.message).toContain("Cannot modify a pre-built blueprint");
    });
  });

  describe("DELETE /paper-blueprints/:id", () => {
    it("soft-deletes custom blueprint", async () => {
      const blueprintId = new mongoose.Types.ObjectId().toString();
      mockDeleteBlueprint.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`${BASE}/${blueprintId}`)
        .expect(200);

      expect(res.body.variant).toBe("success");
      expect(mockDeleteBlueprint).toHaveBeenCalledWith(COMPANY_ID, blueprintId);
    });
  });
});
