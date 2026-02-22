import { describe, it, expect } from 'vitest';
import {
  updateFeeSchema,
  bulkUpdateFeesSchema,
  sendReminderSchema,
} from '../src/shared/validation/feeValidation';

const VALID_OID = '507f1f77bcf86cd799439011';

describe('feeValidation', () => {
  describe('updateFeeSchema', () => {
    it('validates valid update with amountPaid', () => {
      const result = updateFeeSchema.safeParse({
        amountPaid: 100,
      });
      expect(result.success).toBe(true);
    });

    it('validates with all optional fields', () => {
      const result = updateFeeSchema.safeParse({
        amount: 500,
        amountPaid: 250,
        dueDate: '2026-06-01T00:00:00.000Z',
        notes: 'Partial payment received',
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative amount', () => {
      const result = updateFeeSchema.safeParse({
        amount: -10,
      });
      expect(result.success).toBe(false);
    });

    it('validates empty object', () => {
      const result = updateFeeSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('bulkUpdateFeesSchema', () => {
    it('validates valid bulk update', () => {
      const result = bulkUpdateFeesSchema.safeParse({
        classId: VALID_OID,
        amount: 300,
        currency: 'GBP',
      });
      expect(result.success).toBe(true);
    });

    it('validates with INR currency', () => {
      const result = bulkUpdateFeesSchema.safeParse({
        classId: VALID_OID,
        amount: 5000,
        currency: 'INR',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing classId', () => {
      const result = bulkUpdateFeesSchema.safeParse({
        amount: 300,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid classId length', () => {
      const result = bulkUpdateFeesSchema.safeParse({
        classId: 'short',
        amount: 300,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sendReminderSchema', () => {
    it('validates valid reminder request', () => {
      const result = sendReminderSchema.safeParse({
        classId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });

    it('validates with optional studentUserIds', () => {
      const result = sendReminderSchema.safeParse({
        classId: VALID_OID,
        studentUserIds: [VALID_OID],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing classId', () => {
      const result = sendReminderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid classId', () => {
      const result = sendReminderSchema.safeParse({ classId: 'short' });
      expect(result.success).toBe(false);
    });
  });
});
