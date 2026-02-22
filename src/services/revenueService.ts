import mongoose from "mongoose";
import { PurchaseModel } from "../models/purchase";
import { ProductModel } from "../models/product";

const User = mongoose.model("User");

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw Object.assign(new Error("Invalid ObjectId"), { status: 400 });
  }
  return new mongoose.Types.ObjectId(id);
}

interface DateRange {
  startDate?: string;
  endDate?: string;
}

function buildDateFilter(dateRange?: DateRange): Record<string, unknown> | null {
  if (!dateRange?.startDate && !dateRange?.endDate) return null;
  const filter: Record<string, Date> = {};
  if (dateRange.startDate) filter.$gte = new Date(dateRange.startDate);
  if (dateRange.endDate) filter.$lte = new Date(dateRange.endDate);
  return filter;
}

// ─── Revenue overview ───────────────────────────────────────────────────────

export async function getRevenueOverview(
  companyId: string,
  dateRange?: DateRange
): Promise<{
  totalRevenue: number;
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  monthOverMonthGrowth: number;
  totalTransactions: number;
  averageOrderValue: number;
}> {
  const companyOid = toObjectId(companyId);
  const baseMatch: Record<string, unknown> = {
    companyId: companyOid,
    status: "completed",
  };

  const dateFilter = buildDateFilter(dateRange);
  if (dateFilter) baseMatch.completedAt = dateFilter;

  // Total revenue and transactions
  const [totals] = await PurchaseModel.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);

  const totalRevenue = totals?.totalRevenue ?? 0;
  const totalTransactions = totals?.totalTransactions ?? 0;
  const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Current and previous month
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [monthAgg] = await PurchaseModel.aggregate([
    {
      $match: {
        companyId: companyOid,
        status: "completed",
        completedAt: { $gte: previousMonthStart },
      },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $gte: ["$completedAt", currentMonthStart] },
            "current",
            "previous",
          ],
        },
        revenue: { $sum: "$amount" },
      },
    },
    {
      $group: {
        _id: null,
        months: { $push: { period: "$_id", revenue: "$revenue" } },
      },
    },
  ]);

  const months: Array<{ period: string; revenue: number }> = monthAgg?.months || [];
  const currentMonthRevenue = months.find((m) => m.period === "current")?.revenue ?? 0;
  const previousMonthRevenue = months.find((m) => m.period === "previous")?.revenue ?? 0;

  const monthOverMonthGrowth =
    previousMonthRevenue > 0
      ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
      : 0;

  return {
    totalRevenue,
    currentMonthRevenue,
    previousMonthRevenue,
    monthOverMonthGrowth: Math.round(monthOverMonthGrowth * 100) / 100,
    totalTransactions,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
  };
}

// ─── Revenue by product type ────────────────────────────────────────────────

export async function getRevenueByProduct(
  companyId: string,
  dateRange?: DateRange
): Promise<Array<{ type: string; revenue: number; count: number }>> {
  const match: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    status: "completed",
  };
  const dateFilter = buildDateFilter(dateRange);
  if (dateFilter) match.completedAt = dateFilter;

  return PurchaseModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$productType",
        revenue: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $project: { _id: 0, type: "$_id", revenue: 1, count: 1 } },
  ]);
}

// ─── Revenue by category ────────────────────────────────────────────────────

export async function getRevenueByCategory(
  companyId: string,
  dateRange?: DateRange
): Promise<Array<{ category: string; revenue: number; count: number }>> {
  const match: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    status: "completed",
  };
  const dateFilter = buildDateFilter(dateRange);
  if (dateFilter) match.completedAt = dateFilter;

  return PurchaseModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$product.category", "uncategorized"] },
        revenue: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $project: { _id: 0, category: "$_id", revenue: 1, count: 1 } },
  ]);
}

// ─── Time series ────────────────────────────────────────────────────────────

export async function getRevenueTimeSeries(
  companyId: string,
  dateRange?: DateRange,
  granularity: "day" | "week" | "month" = "month"
): Promise<Array<{ date: string; revenue: number; count: number }>> {
  const match: Record<string, unknown> = {
    companyId: toObjectId(companyId),
    status: "completed",
  };
  const dateFilter = buildDateFilter(dateRange);
  if (dateFilter) match.completedAt = dateFilter;

  let dateGroup: Record<string, unknown>;
  let dateFormat: string;

  switch (granularity) {
    case "day":
      dateGroup = { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } };
      dateFormat = "%Y-%m-%d";
      break;
    case "week":
      dateGroup = {
        $dateToString: {
          format: "%Y-W%V",
          date: "$completedAt",
        },
      };
      dateFormat = "%Y-W%V";
      break;
    case "month":
    default:
      dateGroup = { $dateToString: { format: "%Y-%m", date: "$completedAt" } };
      dateFormat = "%Y-%m";
      break;
  }

  // suppress unused var
  void dateFormat;

  return PurchaseModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: dateGroup,
        revenue: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", revenue: 1, count: 1 } },
  ]);
}

// ─── Recent transactions ────────────────────────────────────────────────────

interface PaginationOpts {
  page?: number;
  limit?: number;
}

export async function getRecentTransactions(
  companyId: string,
  pagination?: PaginationOpts
): Promise<{ transactions: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }> {
  const companyOid = toObjectId(companyId);
  const query = { companyId: companyOid, status: "completed" };

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  const [purchases, total] = await Promise.all([
    PurchaseModel.find(query)
      .sort({ completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PurchaseModel.countDocuments(query),
  ]);

  // Enrich with buyer name
  const buyerIds = [...new Set(purchases.map((p) => p.buyerUserId.toString()))];
  const buyers = await User.find({ _id: { $in: buyerIds } })
    .select("firstName lastName email")
    .lean();
  const buyerMap = new Map(buyers.map((b: Record<string, unknown>) => [
    (b._id as mongoose.Types.ObjectId).toString(),
    b,
  ]));

  const transactions = purchases.map((p) => {
    const buyer = buyerMap.get(p.buyerUserId.toString()) as Record<string, unknown> | undefined;
    return {
      ...p,
      buyerName: buyer ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() : "Unknown",
      buyerEmail: buyer?.email || "",
    };
  });

  return { transactions, total, page, pageSize: limit };
}

// ─── Top products ───────────────────────────────────────────────────────────

export async function getTopProducts(
  companyId: string,
  limit = 10
): Promise<Array<{ product: Record<string, unknown>; purchaseCount: number; totalRevenue: number }>> {
  const companyOid = toObjectId(companyId);

  const results = await PurchaseModel.aggregate([
    { $match: { companyId: companyOid, status: "completed" } },
    {
      $group: {
        _id: "$productId",
        purchaseCount: { $sum: 1 },
        totalRevenue: { $sum: "$amount" },
      },
    },
    { $sort: { purchaseCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        product: {
          _id: "$product._id",
          title: "$product.title",
          type: "$product.type",
          status: "$product.status",
          thumbnail: "$product.thumbnail",
        },
        purchaseCount: 1,
        totalRevenue: 1,
      },
    },
  ]);

  return results;
}
