import './testSetup';
import { describe, it, expect } from 'vitest';
import {
  listNotificationsSchema,
  updatePreferencesSchema,
  markAllReadSchema,
} from '../src/shared/validation/notificationValidation';

describe('Notification Validation', () => {
  describe('listNotificationsSchema', () => {
    it('validates valid params', () => {
      const result = listNotificationsSchema.safeParse({
        category: 'homework',
        isRead: 'true',
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty params with defaults', () => {
      const result = listNotificationsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts all valid categories', () => {
      const categories = [
        'messaging',
        'homework',
        'fees',
        'announcements',
        'tests',
        'discussions',
        'gamification',
        'courses',
        'payments',
        'system',
      ];
      for (const category of categories) {
        const result = listNotificationsSchema.safeParse({ category });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid category', () => {
      const result = listNotificationsSchema.safeParse({
        category: 'invalid_category',
      });
      expect(result.success).toBe(false);
    });

    it('accepts isRead false string', () => {
      const result = listNotificationsSchema.safeParse({
        isRead: 'false',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid isRead value', () => {
      const result = listNotificationsSchema.safeParse({
        isRead: 'maybe',
      });
      expect(result.success).toBe(false);
    });

    it('rejects page less than 1', () => {
      const result = listNotificationsSchema.safeParse({
        page: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updatePreferencesSchema', () => {
    it('validates valid preferences update with categories array', () => {
      const result = updatePreferencesSchema.safeParse({
        categories: [
          {
            category: 'homework',
            enabled: true,
            channels: ['in_app', 'email'],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts quiet hours config', () => {
      const result = updatePreferencesSchema.safeParse({
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid quiet hours format', () => {
      const result = updatePreferencesSchema.safeParse({
        quietHoursStart: '10pm',
      });
      expect(result.success).toBe(false);
    });

    it('accepts email digest frequency', () => {
      const result = updatePreferencesSchema.safeParse({
        emailDigestFrequency: 'daily',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid email digest frequencies', () => {
      for (const freq of ['instant', 'hourly', 'daily', 'weekly', 'none']) {
        const result = updatePreferencesSchema.safeParse({
          emailDigestFrequency: freq,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid email digest frequency', () => {
      const result = updatePreferencesSchema.safeParse({
        emailDigestFrequency: 'biweekly',
      });
      expect(result.success).toBe(false);
    });

    it('accepts globalEnabled flag', () => {
      const result = updatePreferencesSchema.safeParse({
        globalEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = updatePreferencesSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('markAllReadSchema', () => {
    it('validates with category', () => {
      const result = markAllReadSchema.safeParse({
        category: 'messaging',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = markAllReadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid category', () => {
      const result = markAllReadSchema.safeParse({
        category: 'nonexistent',
      });
      expect(result.success).toBe(false);
    });
  });
});
