import { Router, Request, Response } from "express";
import * as productService from "../../../services/productService";

type CatalogRequest = Request & { tenantId?: string };

export const catalogV2Router = Router({ mergeParams: true });

// GET /api/v2/companies/:companyId/catalog
catalogV2Router.get("/", async (req: CatalogRequest, res: Response) => {
  try {
    const { companyId } = req.params;
    const {
      type, category, yearGroup, subject, search,
      priceMin, priceMax, sort, page, limit,
    } = req.query as Record<string, string>;

    const result = await productService.getCatalog(
      companyId,
      {
        type: type as any,
        category,
        yearGroup,
        subject,
        search,
        priceMin: priceMin ? Number(priceMin) : undefined,
        priceMax: priceMax ? Number(priceMax) : undefined,
      },
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined },
      (sort as any) || "sortOrder"
    );
    return res.ok("catalog", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/catalog/:productId
catalogV2Router.get("/:productId", async (req: CatalogRequest, res: Response) => {
  try {
    const { companyId, productId } = req.params;
    const product = await productService.getProduct(companyId, productId);
    if (product.status !== "active") {
      return res.status(404).sendEnvelope("product not found", "error");
    }
    return res.ok("product", { product });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
