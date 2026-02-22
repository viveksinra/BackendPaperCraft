import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import {
  createProductSchema,
  updateProductSchema,
} from "../../../shared/validation/productValidation";
import * as productService from "../../../services/productService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

type AuthedRequest = Request & { tenantId?: string; auth?: { sub?: string } };

export const productsV2Router = Router({ mergeParams: true });
productsV2Router.use(ensureAuth, requireCompanyContext);

// GET /api/v2/companies/:companyId/products
productsV2Router.get("/", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const { type, status, category, yearGroup, subject, search, page, limit } = req.query as Record<string, string>;
    const result = await productService.listProducts(
      companyId,
      { type: type as any, status, category, yearGroup, subject, search },
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined }
    );
    return res.ok("products", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/products
productsV2Router.post("/", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId } = req.params;
    const tenantId = req.tenantId || "devTenant";
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const product = await productService.createProduct(companyId, tenantId, parsed.data, userEmail);
    return res.status(201).sendEnvelope("product created", "success", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/products/:id
productsV2Router.get("/:id", async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const product = await productService.getProduct(companyId, id);
    return res.ok("product", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/products/:id
productsV2Router.patch("/:id", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const product = await productService.updateProduct(companyId, id, parsed.data, userEmail);
    return res.ok("product updated", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// DELETE /api/v2/companies/:companyId/products/:id
productsV2Router.delete("/:id", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    await productService.deleteProduct(companyId, id);
    return res.ok("product deleted");
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/products/:id/publish
productsV2Router.patch("/:id/publish", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const product = await productService.publishProduct(companyId, id, userEmail);
    return res.ok("product published", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// PATCH /api/v2/companies/:companyId/products/:id/unpublish
productsV2Router.patch("/:id/unpublish", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, id } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const product = await productService.unpublishProduct(companyId, id, userEmail);
    return res.ok("product unpublished", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// POST /api/v2/companies/:companyId/products/from-paper-set/:paperSetId
productsV2Router.post("/from-paper-set/:paperSetId", ensureRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { companyId, paperSetId } = req.params;
    const userEmail = (req.auth?.sub || "").toLowerCase();
    const product = await productService.createProductFromPaperSet(companyId, paperSetId, userEmail);
    return res.status(201).sendEnvelope("product created from paper set", "success", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
