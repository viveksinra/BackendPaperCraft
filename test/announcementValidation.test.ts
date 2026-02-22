import { describe, it, expect } from 'vitest';
import { createAnnouncementSchema } from '../src/shared/validation/announcementValidation';

describe('announcementValidation', () => {
  describe('createAnnouncementSchema', () => {
    it('validates org-wide announcement', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'School Closure',
        body: 'School will be closed tomorrow.',
        audience: 'organization',
      });
      expect(result.success).toBe(true);
    });

    it('validates class-specific announcement', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Homework Due',
        body: 'Please submit by Friday.',
        audience: 'class',
        classId: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('rejects class audience without classId', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Test',
        body: 'Content',
        audience: 'class',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty title', () => {
      const result = createAnnouncementSchema.safeParse({
        title: '',
        body: 'Content',
        audience: 'organization',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty body', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Title',
        body: '',
        audience: 'organization',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid audience', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Title',
        body: 'Content',
        audience: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional expiresAt', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Title',
        body: 'Content',
        audience: 'organization',
        expiresAt: '2026-12-31T23:59:59.000Z',
      });
      expect(result.success).toBe(true);
    });
  });
});
