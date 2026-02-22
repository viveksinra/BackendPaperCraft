import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---- Mocks ----

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
};

const mockProductModel: Record<string, any> = {
  findOne: vi.fn(),
  findById: vi.fn(),
};

const mockPurchaseModel: Record<string, any> = {
  findOne: vi.fn(),
  create: vi.fn(),
};

const mockParentLinkModel: Record<string, any> = {
  findOne: vi.fn(),
};

const mockCompanyModel: Record<string, any> = {
  findById: vi.fn(),
};

const mockUserModel: Record<string, any> = {
  findById: vi.fn(),
};

vi.mock('../../../src/shared/config/stripe', () => ({
  default: mockStripe,
}));

vi.mock('../../../src/shared/config/env', () => ({
  default: {
    STRIPE_PLATFORM_FEE_PERCENT: 10,
    FRONTEND_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../../src/models/product', () => ({
  ProductModel: mockProductModel,
}));

vi.mock('../../../src/models/purchase', () => ({
  PurchaseModel: mockPurchaseModel,
}));

vi.mock('../../../src/models/parentLink', () => ({
  default: mockParentLinkModel,
  ParentLinkModel: mockParentLinkModel,
}));

vi.mock('../../../src/shared/config/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/services/purchaseService', () => ({
  grantAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/queue/queues', () => ({
  addNotificationJob: vi.fn(),
  addPurchaseConfirmationJob: vi.fn(),
}));

const originalMongooseModel = mongoose.model.bind(mongoose);
vi.spyOn(mongoose, 'model').mockImplementation((name: string) => {
  if (name === 'Company') return mockCompanyModel as any;
  if (name === 'User') return mockUserModel as any;
  return originalMongooseModel(name);
});

// ---- Helpers ----

function toObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

// ---- Import service after mocks ----

import {
  createCheckoutSession,
  verifyCheckoutSession,
  handleFreeAccess,
  getEffectivePrice,
} from '../../../src/services/checkoutService';

// ---- Tests ----

describe('checkoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buyerUserId = toObjectId().toString();
  const studentUserId = toObjectId().toString();
  const productId = toObjectId().toString();
  const companyId = toObjectId().toString();

  const makeProduct = (overrides: Record<string, any> = {}) => ({
    _id: productId,
    companyId,
    tenantId: 'tenant-1',
    type: 'paper',
    title: 'Test Paper',
    status: 'active',
    pricing: { basePrice: 2000, currency: 'GBP', isFree: false, discountPrice: null, discountValidUntil: null },
    addOns: [],
    bundleItems: [],
    ...overrides,
  });

  describe('getEffectivePrice', () => {
    it('returns discount when active and not expired', () => {
      const product = makeProduct({
        pricing: {
          basePrice: 2000,
          isFree: false,
          discountPrice: 1500,
          discountValidUntil: new Date(Date.now() + 86400000), // tomorrow
          currency: 'GBP',
        },
      });

      const price = getEffectivePrice(product as any);
      expect(price).toBe(1500);
    });

    it('returns base price when discount expired', () => {
      const product = makeProduct({
        pricing: {
          basePrice: 2000,
          isFree: false,
          discountPrice: 1500,
          discountValidUntil: new Date(Date.now() - 86400000), // yesterday
          currency: 'GBP',
        },
      });

      const price = getEffectivePrice(product as any);
      expect(price).toBe(2000);
    });

    it('returns 0 for free products', () => {
      const product = makeProduct({
        pricing: { basePrice: 0, isFree: true, currency: 'GBP' },
      });

      const price = getEffectivePrice(product as any);
      expect(price).toBe(0);
    });
  });

  describe('createCheckoutSession', () => {
    it('creates Purchase + Stripe session and returns sessionId/checkoutUrl', async () => {
      const product = makeProduct();
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);
      mockPurchaseModel.findOne.mockResolvedValue(null); // no existing purchase
      mockCompanyModel.findById.mockResolvedValue({ _id: companyId, stripeAccountId: 'acct_test' });
      mockUserModel.findById.mockResolvedValue({ _id: buyerUserId, email: 'buyer@test.com' });
      mockPurchaseModel.create.mockResolvedValue({
        _id: toObjectId(),
        stripeSessionId: 'cs_test_123',
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      });

      const result = await createCheckoutSession(
        buyerUserId,
        'student',
        studentUserId,
        productId
      );

      expect(result).toBeDefined();
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
    });

    it('returns error for already purchased product', async () => {
      const product = makeProduct();
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);
      mockPurchaseModel.findOne.mockResolvedValue({
        _id: toObjectId(),
        status: 'completed',
      });

      await expect(
        createCheckoutSession(buyerUserId, 'student', studentUserId, productId)
      ).rejects.toThrow();
    });

    it('validates ParentLink for parent buying for child', async () => {
      const product = makeProduct();
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);
      mockPurchaseModel.findOne.mockResolvedValue(null);
      mockParentLinkModel.findOne.mockResolvedValue({
        parentUserId: buyerUserId,
        studentUserId,
        status: 'active',
      });
      mockCompanyModel.findById.mockResolvedValue({ _id: companyId, stripeAccountId: 'acct_test' });
      mockUserModel.findById.mockResolvedValue({ _id: buyerUserId, email: 'parent@test.com' });
      mockPurchaseModel.create.mockResolvedValue({ _id: toObjectId() });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/test2',
      });

      const result = await createCheckoutSession(
        buyerUserId,
        'parent',
        studentUserId,
        productId
      );

      expect(result).toBeDefined();
    });

    it('returns error for parent without linked child', async () => {
      const product = makeProduct();
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);
      mockPurchaseModel.findOne.mockResolvedValue(null);
      mockParentLinkModel.findOne.mockResolvedValue(null);

      await expect(
        createCheckoutSession(buyerUserId, 'parent', studentUserId, productId)
      ).rejects.toThrow();
    });

    it('returns error for inactive product', async () => {
      const product = makeProduct({ status: 'inactive' });
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);

      await expect(
        createCheckoutSession(buyerUserId, 'student', studentUserId, productId)
      ).rejects.toThrow();
    });

    it('calculates total correctly with add-ons', async () => {
      const product = makeProduct({
        addOns: [
          { type: 'checking', title: 'Checking', price: 500 },
          { type: 'marking', title: 'Marking', price: 300 },
        ],
      });
      mockProductModel.findById.mockResolvedValue(product);
      mockProductModel.findOne.mockResolvedValue(product);
      mockPurchaseModel.findOne.mockResolvedValue(null);
      mockCompanyModel.findById.mockResolvedValue({ _id: companyId, stripeAccountId: 'acct_test' });
      mockUserModel.findById.mockResolvedValue({ _id: buyerUserId, email: 'buyer@test.com' });
      mockPurchaseModel.create.mockResolvedValue({ _id: toObjectId() });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_addons',
        url: 'https://checkout.stripe.com/addons',
      });

      await createCheckoutSession(
        buyerUserId,
        'student',
        studentUserId,
        productId,
        ['checking', 'marking']
      );

      // Base 2000 + addons 500 + 300 = 2800 pence
      const createCall = mockStripe.checkout.sessions.create.mock.calls[0][0];
      const lineAmount = createCall?.line_items?.[0]?.price_data?.unit_amount;
      expect(lineAmount).toBeGreaterThanOrEqual(2800);
    });
  });

  describe('handleFreeAccess', () => {
    it('grants access immediately for free product', async () => {
      const freeProduct = makeProduct({
        pricing: { basePrice: 0, isFree: true, currency: 'GBP' },
      });
      mockProductModel.findById.mockResolvedValue(freeProduct);
      mockProductModel.findOne.mockResolvedValue(freeProduct);
      mockPurchaseModel.findOne.mockResolvedValue(null);
      mockPurchaseModel.create.mockResolvedValue({
        _id: toObjectId(),
        status: 'completed',
        accessGranted: true,
      });

      const result = await handleFreeAccess(
        buyerUserId,
        'student',
        studentUserId,
        productId
      );

      expect(result).toBeDefined();
      // Should not call Stripe
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('returns error for non-free product', async () => {
      const paidProduct = makeProduct();
      mockProductModel.findById.mockResolvedValue(paidProduct);
      mockProductModel.findOne.mockResolvedValue(paidProduct);

      await expect(
        handleFreeAccess(buyerUserId, 'student', studentUserId, productId)
      ).rejects.toThrow();
    });
  });
});
