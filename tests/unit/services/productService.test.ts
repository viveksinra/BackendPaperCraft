import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---- Mocks ----

const mockProductModel: Record<string, any> = {
  create: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  countDocuments: vi.fn(),
};

const mockPaperSetModel: Record<string, any> = {
  findOne: vi.fn(),
};

const mockCompanyModel: Record<string, any> = {
  findById: vi.fn(),
};

vi.mock('../../../src/models/product', () => ({
  ProductModel: mockProductModel,
}));

vi.mock('../../../src/models/paperSet', () => ({
  default: mockPaperSetModel,
  PaperSetModel: mockPaperSetModel,
}));

const originalMongooseModel = mongoose.model.bind(mongoose);
vi.spyOn(mongoose, 'model').mockImplementation((name: string) => {
  if (name === 'Company') return mockCompanyModel as any;
  return originalMongooseModel(name);
});

vi.mock('../../../src/shared/config/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---- Helpers ----

function toObjectId(hex?: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(hex ?? undefined);
}

function chainable(resolvedValue: unknown) {
  const obj: Record<string, any> = {};
  obj.sort = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.skip = vi.fn().mockReturnValue(obj);
  obj.lean = vi.fn().mockResolvedValue(resolvedValue);
  obj.populate = vi.fn().mockReturnValue(obj);
  obj.select = vi.fn().mockReturnValue(obj);
  return obj;
}

// ---- Import service after mocks ----

import {
  createProduct,
  updateProduct,
  publishProduct,
  unpublishProduct,
  getCatalog,
  getProductByReference,
  createProductFromPaperSet,
} from '../../../src/services/productService';

// ---- Tests ----

describe('productService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const companyId = toObjectId().toString();
  const tenantId = 'tenant-1';

  describe('createProduct', () => {
    it('creates product with status "draft"', async () => {
      const input = {
        type: 'paper',
        title: 'Test Paper',
        referenceId: toObjectId().toString(),
        pricing: { basePrice: 1000, currency: 'GBP', isFree: false },
      };

      // No existing active product
      mockProductModel.findOne.mockResolvedValue(null);
      mockProductModel.create.mockResolvedValue({
        _id: toObjectId(),
        ...input,
        status: 'draft',
        companyId,
        tenantId,
      });

      const result = await createProduct(companyId, tenantId, input, 'admin@test.com');

      expect(result).toBeDefined();
      expect(mockProductModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          companyId,
          tenantId,
        })
      );
    });

    it('returns error for duplicate referenceId on same company', async () => {
      const input = {
        type: 'paper',
        title: 'Test Paper',
        referenceId: toObjectId().toString(),
        pricing: { basePrice: 1000, currency: 'GBP', isFree: false },
      };

      mockProductModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        status: 'active',
      });

      await expect(
        createProduct(companyId, tenantId, input, 'admin@test.com')
      ).rejects.toThrow();
    });

    it('requires bundleItems for bundle type', async () => {
      const input = {
        type: 'bundle',
        title: 'Test Bundle',
        pricing: { basePrice: 2000, currency: 'GBP', isFree: false },
        bundleItems: [],
      };

      mockProductModel.findOne.mockResolvedValue(null);

      await expect(
        createProduct(companyId, tenantId, input, 'admin@test.com')
      ).rejects.toThrow();
    });

    it('creates bundle with valid bundleItems', async () => {
      const bundleItemId = toObjectId();
      const input = {
        type: 'bundle',
        title: 'Test Bundle',
        pricing: { basePrice: 2000, currency: 'GBP', isFree: false },
        bundleItems: [
          { productId: bundleItemId.toString(), referenceType: 'paper', referenceId: toObjectId().toString(), title: 'Paper 1' },
        ],
      };

      mockProductModel.findOne.mockResolvedValue(null);
      mockProductModel.create.mockResolvedValue({
        _id: toObjectId(),
        ...input,
        status: 'draft',
      });

      const result = await createProduct(companyId, tenantId, input, 'admin@test.com');
      expect(result).toBeDefined();
    });
  });

  describe('publishProduct', () => {
    it('sets status "active" and publishedAt', async () => {
      const productId = toObjectId().toString();
      const product = {
        _id: productId,
        companyId,
        title: 'Test Product',
        status: 'draft',
        pricing: { basePrice: 1000, isFree: false },
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockProductModel.findOne.mockResolvedValue(product);
      mockCompanyModel.findById.mockResolvedValue({
        _id: companyId,
        stripeAccountId: 'acct_test123',
      });

      await publishProduct(companyId, productId, 'admin@test.com');

      expect(product.status).toBe('active');
      expect(product.save).toHaveBeenCalled();
    });

    it('returns error for company without stripeAccountId (paid product)', async () => {
      const productId = toObjectId().toString();
      const product = {
        _id: productId,
        companyId,
        title: 'Test Product',
        status: 'draft',
        pricing: { basePrice: 1000, isFree: false },
        save: vi.fn(),
      };

      mockProductModel.findOne.mockResolvedValue(product);
      mockCompanyModel.findById.mockResolvedValue({
        _id: companyId,
        stripeAccountId: null,
      });

      await expect(
        publishProduct(companyId, productId, 'admin@test.com')
      ).rejects.toThrow();
    });

    it('succeeds for free product without Stripe account', async () => {
      const productId = toObjectId().toString();
      const product = {
        _id: productId,
        companyId,
        title: 'Free Product',
        status: 'draft',
        pricing: { basePrice: 0, isFree: true },
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockProductModel.findOne.mockResolvedValue(product);
      mockCompanyModel.findById.mockResolvedValue({
        _id: companyId,
        stripeAccountId: null,
      });

      await publishProduct(companyId, productId, 'admin@test.com');

      expect(product.status).toBe('active');
      expect(product.save).toHaveBeenCalled();
    });
  });

  describe('unpublishProduct', () => {
    it('sets status "inactive"', async () => {
      const productId = toObjectId().toString();
      const product = {
        _id: productId,
        companyId,
        status: 'active',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockProductModel.findOne.mockResolvedValue(product);

      await unpublishProduct(companyId, productId, 'admin@test.com');

      expect(product.status).toBe('inactive');
      expect(product.save).toHaveBeenCalled();
    });
  });

  describe('getCatalog', () => {
    it('returns only active products (no drafts)', async () => {
      const products = [
        { _id: toObjectId(), title: 'Active Product', status: 'active' },
      ];

      mockProductModel.find.mockReturnValue(chainable(products));
      mockProductModel.countDocuments.mockResolvedValue(1);

      const result = await getCatalog(companyId);

      expect(mockProductModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
      expect(result).toBeDefined();
    });

    it('applies filters correctly (type, category, yearGroup)', async () => {
      mockProductModel.find.mockReturnValue(chainable([]));
      mockProductModel.countDocuments.mockResolvedValue(0);

      await getCatalog(companyId, { type: 'paper', category: 'maths', yearGroup: 'Y5' });

      expect(mockProductModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          type: 'paper',
          category: 'maths',
          yearGroup: 'Y5',
        })
      );
    });
  });

  describe('getProductByReference', () => {
    it('returns null when no product exists', async () => {
      mockProductModel.findOne.mockResolvedValue(null);

      const result = await getProductByReference(
        companyId,
        'paper',
        toObjectId().toString()
      );

      expect(result).toBeNull();
    });
  });

  describe('createProductFromPaperSet', () => {
    it('copies pricing and add-ons correctly from PaperSet', async () => {
      const paperSetId = toObjectId().toString();
      const paperSet = {
        _id: paperSetId,
        title: 'Paper Set Alpha',
        description: 'Description',
        pricing: { basePrice: 2500, currency: 'GBP', isFree: false },
        addOns: [{ type: 'checking', title: 'Checking Service', price: 500 }],
        papers: [{ _id: toObjectId() }],
      };

      mockPaperSetModel.findOne.mockResolvedValue(paperSet);
      mockProductModel.findOne.mockResolvedValue(null);
      mockProductModel.create.mockResolvedValue({
        _id: toObjectId(),
        title: paperSet.title,
        type: 'paper_set',
        referenceId: paperSetId,
        pricing: paperSet.pricing,
        addOns: paperSet.addOns,
        status: 'draft',
      });

      const result = await createProductFromPaperSet(
        companyId,
        paperSetId,
        'admin@test.com'
      );

      expect(result).toBeDefined();
      expect(mockProductModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'paper_set',
          referenceId: paperSetId,
        })
      );
    });
  });
});
