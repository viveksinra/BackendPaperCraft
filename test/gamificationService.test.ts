import './testSetup';
import { describe, it, expect } from 'vitest';
import {
  updateConfigSchema,
  addBadgeSchema,
  updateBadgeSchema,
  leaderboardSchema,
  manualAwardSchema,
  pointsHistorySchema,
} from '../src/shared/validation/gamificationValidation';

const VALID_OID = '507f1f77bcf86cd799439011';

describe('Gamification Validation', () => {
  describe('updateConfigSchema', () => {
    it('validates a valid config update', () => {
      const result = updateConfigSchema.safeParse({
        isEnabled: true,
        pointRules: [
          { action: 'test_completed', points: 10, maxPerDay: 5 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts partial updates', () => {
      const result = updateConfigSchema.safeParse({
        isEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts streak config', () => {
      const result = updateConfigSchema.safeParse({
        streakConfig: {
          gracePeriodHours: 24,
          requiredActivities: ['login', 'test_completed'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts levels config', () => {
      const result = updateConfigSchema.safeParse({
        levels: [
          { level: 1, name: 'Beginner', pointsRequired: 0 },
          { level: 2, name: 'Intermediate', pointsRequired: 100 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts leaderboard config', () => {
      const result = updateConfigSchema.safeParse({
        leaderboardConfig: {
          enabled: true,
          resetFrequency: 'weekly',
          showTopN: 10,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty pointRules array', () => {
      const result = updateConfigSchema.safeParse({
        pointRules: [],
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty object', () => {
      const result = updateConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('addBadgeSchema', () => {
    it('validates a valid badge', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'test_champion',
        name: 'Test Champion',
        description: 'Score 100% on any test',
        icon: 'trophy',
        criteria: {
          type: 'points',
          threshold: 100,
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'test_badge',
        name: '',
        criteria: { type: 'count', threshold: 5 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid badgeId format', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'Test-Badge!',
        name: 'Test Badge',
        criteria: { type: 'count', threshold: 5 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid badgeId with underscores and numbers', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'badge_level_2',
        name: 'Level 2 Badge',
        criteria: { type: 'level', threshold: 2 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional tier', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'gold_star',
        name: 'Gold Star',
        tier: 'gold',
        criteria: { type: 'points', threshold: 500 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid criteria types', () => {
      for (const type of ['count', 'streak', 'points', 'level']) {
        const result = addBadgeSchema.safeParse({
          badgeId: `badge_${type}`,
          name: `Badge ${type}`,
          criteria: { type, threshold: 10 },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects missing criteria', () => {
      const result = addBadgeSchema.safeParse({
        badgeId: 'test_badge',
        name: 'Test Badge',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateBadgeSchema', () => {
    it('validates partial badge update', () => {
      const result = updateBadgeSchema.safeParse({
        name: 'Updated Badge Name',
      });
      expect(result.success).toBe(true);
    });

    it('accepts isActive flag', () => {
      const result = updateBadgeSchema.safeParse({
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = updateBadgeSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('leaderboardSchema', () => {
    it('validates valid query', () => {
      const result = leaderboardSchema.safeParse({
        period: 'weekly',
        page: 1,
        pageSize: 10,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty query with defaults', () => {
      const result = leaderboardSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts all valid periods', () => {
      for (const period of ['all_time', 'weekly', 'monthly']) {
        const result = leaderboardSchema.safeParse({ period });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid period', () => {
      const result = leaderboardSchema.safeParse({
        period: 'daily',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional classId filter', () => {
      const result = leaderboardSchema.safeParse({
        period: 'weekly',
        classId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('manualAwardSchema', () => {
    it('validates valid award', () => {
      const result = manualAwardSchema.safeParse({
        studentUserId: VALID_OID,
        points: 50,
        description: 'Exceptional participation',
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero points', () => {
      const result = manualAwardSchema.safeParse({
        studentUserId: VALID_OID,
        points: 0,
        description: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative points', () => {
      const result = manualAwardSchema.safeParse({
        studentUserId: VALID_OID,
        points: -10,
        description: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing studentUserId', () => {
      const result = manualAwardSchema.safeParse({
        points: 50,
        description: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty description', () => {
      const result = manualAwardSchema.safeParse({
        studentUserId: VALID_OID,
        points: 50,
        description: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing description', () => {
      const result = manualAwardSchema.safeParse({
        studentUserId: VALID_OID,
        points: 50,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('pointsHistorySchema', () => {
    it('validates valid pagination', () => {
      const result = pointsHistorySchema.safeParse({
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty params with defaults', () => {
      const result = pointsHistorySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
