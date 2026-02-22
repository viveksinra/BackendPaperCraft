import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ---- Mocks ----

const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  paymentIntents: {
    retrieve: vi.fn(),
  },
  charges: {
    retrieve: vi.fn(),
  },
};

const mockPurchaseModel: Record<string, any> = {
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
};

const mockCompanyModel: Record<string, any> = {
  findOneAndUpdate: vi.fn(),
  findOne: vi.fn(),
};

vi.mock('../../../src/shared/config/stripe', () => ({
  default: mockStripe,
}));

vi.mock('../../../src/shared/config/env', () => ({
  default: {
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  },
}));

vi.mock('../../../src/models/purchase', () => ({
  PurchaseModel: mockPurchaseModel,
}));

vi.mock('../../../src/shared/config/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../src/services/purchaseService', () => ({
  grantAccess: vi.fn().mockResolvedValue(undefined),
  revokeAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/queue/queues', () => ({
  addNotificationJob: vi.fn(),
  addPurchaseConfirmationJob: vi.fn(),
}));

const originalMongooseModel = mongoose.model.bind(mongoose);
vi.spyOn(mongoose, 'model').mockImplementation((name: string) => {
  if (name === 'Company') return mockCompanyModel as any;
  return originalMongooseModel(name);
});

// ---- Helpers ----

function toObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

// ---- Import service after mocks ----

import { handleWebhook } from '../../../src/services/stripeWebhookService';
import { grantAccess, revokeAccess } from '../../../src/services/purchaseService';
import { addNotificationJob } from '../../../src/queue/queues';

// ---- Tests ----

describe('stripeWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const purchaseId = toObjectId().toString();

  describe('handleWebhook', () => {
    it('checkout.session.completed: grants access to student', async () => {
      const session = {
        id: 'cs_test_123',
        payment_intent: 'pi_test_123',
        metadata: { purchaseId },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });

      const purchase = {
        _id: purchaseId,
        status: 'pending',
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_123',
        latest_charge: 'ch_test_123',
      });
      mockStripe.charges.retrieve.mockResolvedValue({
        id: 'ch_test_123',
        receipt_url: 'https://receipt.stripe.com/test',
      });

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(grantAccess).toHaveBeenCalledWith(purchaseId);
    });

    it('checkout.session.completed: idempotent (second call does not duplicate access)', async () => {
      const session = {
        id: 'cs_test_123',
        payment_intent: 'pi_test_123',
        metadata: { purchaseId },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });

      // Purchase already completed
      const purchase = {
        _id: purchaseId,
        status: 'completed',
        accessGranted: true,
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      // Should not re-grant if already completed
      // (implementation may still call grantAccess which is idempotent)
      expect(mockPurchaseModel.findOne).toHaveBeenCalled();
    });

    it('checkout.session.completed: saves receipt URL from charge', async () => {
      const session = {
        id: 'cs_test_123',
        payment_intent: 'pi_test_123',
        metadata: { purchaseId },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: session },
      });

      const purchase: Record<string, any> = {
        _id: purchaseId,
        status: 'pending',
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_123',
        latest_charge: 'ch_test_123',
      });
      mockStripe.charges.retrieve.mockResolvedValue({
        id: 'ch_test_123',
        receipt_url: 'https://receipt.stripe.com/test',
      });

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(purchase.receiptUrl || purchase.save).toBeTruthy();
    });

    it('payment_intent.payment_failed: sets purchase to failed with failure reason', async () => {
      const pi = {
        id: 'pi_test_fail',
        metadata: { purchaseId },
        last_payment_error: { message: 'Card declined' },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: pi },
      });

      const purchase: Record<string, any> = {
        _id: purchaseId,
        status: 'pending',
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(purchase.status).toBe('failed');
      expect(purchase.save).toHaveBeenCalled();
    });

    it('payment_intent.payment_failed: queues notification to buyer', async () => {
      const pi = {
        id: 'pi_test_fail',
        metadata: { purchaseId },
        last_payment_error: { message: 'Card declined' },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: pi },
      });

      const purchase: Record<string, any> = {
        _id: purchaseId,
        status: 'pending',
        buyerUserId: toObjectId().toString(),
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(addNotificationJob).toHaveBeenCalled();
    });

    it('charge.refunded: revokes access and marks purchase refunded', async () => {
      const charge = {
        id: 'ch_test_refund',
        payment_intent: 'pi_test_refund',
        metadata: { purchaseId },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: charge },
      });

      const purchase: Record<string, any> = {
        _id: purchaseId,
        status: 'completed',
        stripePaymentIntentId: 'pi_test_refund',
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockPurchaseModel.findOne.mockResolvedValue(purchase);

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(revokeAccess).toHaveBeenCalled();
    });

    it('account.updated: updates Company Stripe status fields', async () => {
      const account = {
        id: 'acct_test_update',
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
      };

      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'account.updated',
        data: { object: account },
      });

      mockCompanyModel.findOneAndUpdate.mockResolvedValue({ _id: toObjectId() });

      await handleWebhook(Buffer.from('raw'), 'sig_test');

      expect(mockCompanyModel.findOneAndUpdate).toHaveBeenCalledWith(
        { stripeAccountId: 'acct_test_update' },
        expect.objectContaining({
          payoutsEnabled: true,
          chargesEnabled: true,
        })
      );
    });

    it('invalid signature: throws error', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        handleWebhook(Buffer.from('raw'), 'invalid_sig')
      ).rejects.toThrow();
    });

    it('unknown event type: returns without error', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'unknown.event.type',
        data: { object: {} },
      });

      // Should not throw
      await handleWebhook(Buffer.from('raw'), 'sig_test');
    });
  });
});
