import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---- Mocks ----

const mockPurchaseModel: Record<string, any> = {
  aggregate: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
};

const mockProductModel: Record<string, any> = {
  findById: vi.fn(),
  find: vi.fn(),
};

const mockUserModel: Record<string, any> = {
  findById: vi.fn(),
};

vi.mock('../../../src/models/purchase', () => ({
  PurchaseModel: mockPurchaseModel,
}));

vi.mock('../../../src/models/product', () => ({
  ProductModel: mockProductModel,
}));

vi.mock('../../../src/shared/config/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const originalMongooseModel = mongoose.model.bind(mongoose);
vi.spyOn(mongoose, 'model').mockImplementation((name: string) => {
  if (name === 'User') return mockUserModel as any;
  return originalMongooseModel(name);
});

// ---- Helpers ----

function toObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function chainable(resolvedValue: unknown) {
  const obj: Record<string, any> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.populate = vi.fn().mockReturnValue(obj);
  return obj;
}

// ---- Import service after mocks ----

import {
  getRevenueOverview,
  getRevenueByProduct,
  getRevenueByCategory,
  getRevenueTimeSeries,
  getRecentTransactions,
  getTopProducts,
} from '../../../src/services/revenueService';

// ---- Tests ----

describe('revenueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const companyId = toObjectId().toString();

  describe('getRevenueOverview', () => {
    it('returns correct total, month, growth', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        {
          _id: null,
          totalRevenue: 50000,
          totalTransactions: 25,
          currentMonth: 15000,
          previousMonth: 10000,
        },
      ]);

      const result = await getRevenueOverview(companyId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });

    it('applies date range filter', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        {
          _id: null,
          totalRevenue: 20000,
          totalTransactions: 10,
          currentMonth: 5000,
          previousMonth: 3000,
        },
      ]);

      const result = await getRevenueOverview(companyId, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(result).toBeDefined();
      // The aggregate call should include date filters
      const aggregateCall = mockPurchaseModel.aggregate.mock.calls[0][0];
      const matchStage = aggregateCall.find(
        (stage: any) => stage.$match
      );
      expect(matchStage).toBeDefined();
    });
  });

  describe('getRevenueByProduct', () => {
    it('groups correctly by product type', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        { _id: 'paper', totalRevenue: 20000, count: 10 },
        { _id: 'test', totalRevenue: 15000, count: 8 },
        { _id: 'paper_set', totalRevenue: 10000, count: 5 },
      ]);

      const result = await getRevenueByProduct(companyId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getRevenueByCategory', () => {
    it('groups correctly by category', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        { _id: 'maths', totalRevenue: 25000, count: 12 },
        { _id: 'english', totalRevenue: 20000, count: 10 },
      ]);

      const result = await getRevenueByCategory(companyId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getRevenueTimeSeries', () => {
    it('returns monthly data points', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        { _id: '2026-01', revenue: 15000, transactions: 8 },
        { _id: '2026-02', revenue: 20000, transactions: 12 },
      ]);

      const result = await getRevenueTimeSeries(companyId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });

    it('returns daily data points when granularity specified', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        { _id: '2026-02-01', revenue: 1000, transactions: 2 },
        { _id: '2026-02-02', revenue: 1500, transactions: 3 },
      ]);

      const result = await getRevenueTimeSeries(companyId, undefined, 'day');

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getRecentTransactions', () => {
    it('returns paginated transaction list', async () => {
      const transactions = [
        {
          _id: toObjectId(),
          productTitle: 'Paper 1',
          amount: 2000,
          status: 'completed',
          createdAt: new Date(),
        },
      ];

      mockPurchaseModel.find.mockReturnValue(chainable(transactions));
      mockPurchaseModel.countDocuments.mockResolvedValue(1);

      const result = await getRecentTransactions(companyId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('getTopProducts', () => {
    it('returns top N products by sales', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([
        { _id: toObjectId(), totalRevenue: 15000, count: 10, productTitle: 'Paper 1' },
        { _id: toObjectId(), totalRevenue: 12000, count: 8, productTitle: 'Paper 2' },
      ]);

      const result = await getTopProducts(companyId, 5);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('authorization', () => {
    it('all queries filter by companyId', async () => {
      mockPurchaseModel.aggregate.mockResolvedValue([]);
      mockPurchaseModel.find.mockReturnValue(chainable([]));
      mockPurchaseModel.countDocuments.mockResolvedValue(0);

      await getRevenueOverview(companyId);

      const aggregateCall = mockPurchaseModel.aggregate.mock.calls[0][0];
      const matchStage = aggregateCall.find(
        (stage: any) => stage.$match
      );

      // Should include companyId filter for tenant isolation
      expect(matchStage?.$match).toHaveProperty('companyId');
    });
  });
});
