import { Router, Request, Response } from "express";
import path from "path";
import { requireCompanyContext } from "../../../shared/middleware/requireCompanyContext";
import { ensureRole } from "../../../shared/middleware/ensureRole";
import { dateRangeSchema, timeSeriesSchema } from "../../../shared/validation/revenueValidation";
import * as revenueService from "../../../services/revenueService";

const legacyAuth = require(path.join(__dirname, "..", "..", "..", "..", "utils", "auth"));
const { ensureAuth } = legacyAuth;

export const revenueV2Router = Router({ mergeParams: true });
revenueV2Router.use(ensureAuth, requireCompanyContext, ensureRole("admin"));

// GET /api/v2/companies/:companyId/revenue/overview
revenueV2Router.get("/overview", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const result = await revenueService.getRevenueOverview(companyId, parsed.data);
    return res.ok("revenue overview", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/revenue/by-product
revenueV2Router.get("/by-product", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const breakdown = await revenueService.getRevenueByProduct(companyId, parsed.data);
    return res.ok("revenue by product", { breakdown });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/revenue/by-category
revenueV2Router.get("/by-category", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = dateRangeSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const breakdown = await revenueService.getRevenueByCategory(companyId, parsed.data);
    return res.ok("revenue by category", { breakdown });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/revenue/time-series
revenueV2Router.get("/time-series", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const parsed = timeSeriesSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.fail(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { startDate, endDate, granularity } = parsed.data;
    const series = await revenueService.getRevenueTimeSeries(
      companyId,
      { startDate, endDate },
      granularity
    );
    return res.ok("revenue time series", { series });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/revenue/transactions
revenueV2Router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { page, pageSize } = req.query as Record<string, string>;
    const result = await revenueService.getRecentTransactions(companyId, {
      page: page ? Number(page) : undefined,
      limit: pageSize ? Number(pageSize) : undefined,
    });
    return res.ok("recent transactions", result);
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});

// GET /api/v2/companies/:companyId/revenue/top-products
revenueV2Router.get("/top-products", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const limit = Number(req.query.limit) || 10;
    const products = await revenueService.getTopProducts(companyId, limit);
    return res.ok("top products", { products });
  } catch (err: any) {
    return res.status(err.status || 500).sendEnvelope(err.message, "error");
  }
});
