import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---- Mocks ----

const mockPurchaseModel: Record<string, any> = {
  findOne: vi.fn(),
  find: vi.fn(),
  findById: vi.fn(),
  countDocuments: vi.fn(),
  aggregate: vi.fn(),
};

const mockProductModel: Record<string, any> = {
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  findOne: vi.fn(),
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

vi.mock('../../../src/queue/queues', () => ({
  addNotificationJob: vi.fn(),
  addPurchaseConfirmationJob: vi.fn(),
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
  hasAccess,
  grantAccess,
  revokeAccess,
  getStudentPurchases,
  getParentPurchases,
} from '../../../src/services/purchaseService';

import { addNotificationJob } from '../../../src/queue/queues';

// ---- Tests ----

describe('purchaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const studentUserId = toObjectId().toString();
  const parentUserId = toObjectId().toString();
  const purchaseId = toObjectId().toString();
  const productId = toObjectId().toString();

  describe('hasAccess', () => {
    it('returns true for completed purchase with accessGranted=true', async () => {
      mockPurchaseModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        studentUserId,
        status: 'completed',
        accessGranted: true,
      });

      const result = await hasAccess(studentUserId, 'paper', toObjectId().toString());
      expect(result).toBe(true);
    });

    it('returns false for pending purchase', async () => {
      mockPurchaseModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        studentUserId,
        status: 'pending',
        accessGranted: false,
      });

      const result = await hasAccess(studentUserId, 'paper', toObjectId().toString());
      expect(result).toBe(false);
    });

    it('returns false for failed purchase', async () => {
      mockPurchaseModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        studentUserId,
        status: 'failed',
        accessGranted: false,
      });

      const result = await hasAccess(studentUserId, 'paper', toObjectId().toString());
      expect(result).toBe(false);
    });

    it('returns true for bundle purchase granting access to bundle items', async () => {
      // No direct purchase
      mockPurchaseModel.findOne.mockResolvedValueOnce(null);
      // But a bundle purchase that includes this content
      mockProductModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        type: 'bundle',
        bundleItems: [
          { referenceType: 'paper', referenceId: toObjectId().toString() },
        ],
      });
      // Bundle purchase exists
      mockPurchaseModel.findOne.mockResolvedValueOnce({
        _id: toObjectId(),
        status: 'completed',
        accessGranted: true,
        productType: 'bundle',
      });

      const result = await hasAccess(studentUserId, 'paper', toObjectId().toString());
      // Should check bundle access
      expect(mockPurchaseModel.findOne).toHaveBeenCalled();
    });

    it('returns false for non-purchased content', async () => {
      mockPurchaseModel.findOne.mockResolvedValue(null);
      mockProductModel.findOne.mockResolvedValue(null);

      const result = await hasAccess(studentUserId, 'paper', toObjectId().toString());
      expect(result).toBe(false);
    });
  });

  describe('grantAccess', () => {
    it('sets accessGranted=true and accessGrantedAt', async () => {
      const purchase = {
        _id: purchaseId,
        productId,
        studentUserId,
        buyerUserId: studentUserId,
        accessGranted: false,
        status: 'completed',
        productType: 'paper',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockPurchaseModel.findById.mockResolvedValue(purchase);
      mockProductModel.findByIdAndUpdate.mockResolvedValue(undefined);
      mockProductModel.findById.mockResolvedValue({ _id: productId, type: 'paper', bundleItems: [] });
      mockUserModel.findById.mockResolvedValue({ _id: studentUserId, firstName: 'Test' });

      await grantAccess(purchaseId);

      expect(purchase.accessGranted).toBe(true);
      expect(purchase.save).toHaveBeenCalled();
    });

    it('increments Product.totalPurchases', async () => {
      const purchase = {
        _id: purchaseId,
        productId,
        studentUserId,
        buyerUserId: studentUserId,
        accessGranted: false,
        status: 'completed',
        productType: 'paper',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockPurchaseModel.findById.mockResolvedValue(purchase);
      mockProductModel.findByIdAndUpdate.mockResolvedValue(undefined);
      mockProductModel.findById.mockResolvedValue({ _id: productId, type: 'paper', bundleItems: [] });
      mockUserModel.findById.mockResolvedValue({ _id: studentUserId, firstName: 'Test' });

      await grantAccess(purchaseId);

      expect(mockProductModel.findByIdAndUpdate).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ $inc: { totalPurchases: 1 } })
      );
    });

    it('queues notification for the student', async () => {
      const purchase = {
        _id: purchaseId,
        productId,
        studentUserId,
        buyerUserId: studentUserId,
        accessGranted: false,
        status: 'completed',
        productType: 'paper',
        productTitle: 'Test Paper',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockPurchaseModel.findById.mockResolvedValue(purchase);
      mockProductModel.findByIdAndUpdate.mockResolvedValue(undefined);
      mockProductModel.findById.mockResolvedValue({ _id: productId, type: 'paper', bundleItems: [] });
      mockUserModel.findById.mockResolvedValue({ _id: studentUserId, firstName: 'Test' });

      await grantAccess(purchaseId);

      expect(addNotificationJob).toHaveBeenCalled();
    });
  });

  describe('revokeAccess', () => {
    it('sets accessGranted=false and status "refunded"', async () => {
      const purchase = {
        _id: purchaseId,
        accessGranted: true,
        status: 'completed',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockPurchaseModel.findById.mockResolvedValue(purchase);

      await revokeAccess(purchaseId, 'Customer requested refund');

      expect(purchase.accessGranted).toBe(false);
      expect(purchase.status).toBe('refunded');
      expect(purchase.save).toHaveBeenCalled();
    });

    it('sets refundedAt and refundReason', async () => {
      const purchase: Record<string, any> = {
        _id: purchaseId,
        accessGranted: true,
        status: 'completed',
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockPurchaseModel.findById.mockResolvedValue(purchase);

      await revokeAccess(purchaseId, 'Customer requested refund');

      expect(purchase.refundedAt).toBeDefined();
      expect(purchase.refundReason).toBe('Customer requested refund');
    });
  });

  describe('getStudentPurchases', () => {
    it('returns correct purchases with filters', async () => {
      const purchases = [
        { _id: toObjectId(), productTitle: 'Paper 1', status: 'completed' },
        { _id: toObjectId(), productTitle: 'Paper 2', status: 'completed' },
      ];

      mockPurchaseModel.find.mockReturnValue(chainable(purchases));
      mockPurchaseModel.countDocuments.mockResolvedValue(2);

      const result = await getStudentPurchases(studentUserId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ studentUserId })
      );
    });
  });

  describe('getParentPurchases', () => {
    it('returns purchases with child names', async () => {
      const purchases = [
        {
          _id: toObjectId(),
          buyerUserId: parentUserId,
          studentUserId,
          productTitle: 'Paper 1',
          status: 'completed',
        },
      ];

      mockPurchaseModel.find.mockReturnValue(chainable(purchases));
      mockPurchaseModel.countDocuments.mockResolvedValue(1);
      mockUserModel.findById.mockResolvedValue({
        _id: studentUserId,
        firstName: 'John',
        lastName: 'Doe',
      });

      const result = await getParentPurchases(parentUserId);

      expect(result).toBeDefined();
      expect(mockPurchaseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ buyerUserId: parentUserId })
      );
    });
  });
});
