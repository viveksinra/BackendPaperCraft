import { describe, it, expect } from 'vitest';
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  submitHomeworkSchema,
  gradeSubmissionSchema,
} from '../src/shared/validation/homeworkValidation';

const VALID_OID = '507f1f77bcf86cd799439011';
const VALID_OID2 = '507f1f77bcf86cd799439012';

describe('homeworkValidation', () => {
  describe('createHomeworkSchema', () => {
    it('validates a valid questions-type homework', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        title: 'Week 3 Practice',
        type: 'questions',
        dueDate: '2026-03-01T10:00:00.000Z',
        questionIds: [VALID_OID, VALID_OID2],
      });
      expect(result.success).toBe(true);
    });

    it('validates a valid test-type homework', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        title: 'Mock Test 1',
        type: 'test',
        dueDate: '2026-03-01T10:00:00.000Z',
        testId: VALID_OID2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects test-type without testId', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        title: 'Mock Test 1',
        type: 'test',
        dueDate: '2026-03-01T10:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('rejects questions-type without questionIds', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        title: 'Practice',
        type: 'questions',
        dueDate: '2026-03-01T10:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('rejects lateDeadline before dueDate', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        title: 'Practice',
        type: 'questions',
        dueDate: '2026-03-01T10:00:00.000Z',
        lateSubmissionAllowed: true,
        lateDeadline: '2026-02-28T10:00:00.000Z',
        questionIds: [VALID_OID],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const result = createHomeworkSchema.safeParse({
        classId: VALID_OID,
        type: 'questions',
        dueDate: '2026-03-01T10:00:00.000Z',
        questionIds: [VALID_OID],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateHomeworkSchema', () => {
    it('validates partial update', () => {
      const result = updateHomeworkSchema.safeParse({ title: 'Updated Title' });
      expect(result.success).toBe(true);
    });

    it('validates empty object', () => {
      const result = updateHomeworkSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('submitHomeworkSchema', () => {
    it('validates valid answers', () => {
      const result = submitHomeworkSchema.safeParse({
        answers: [
          { questionId: VALID_OID, answer: 'A' },
          { questionId: VALID_OID2, answer: 42 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty answers array', () => {
      const result = submitHomeworkSchema.safeParse({
        answers: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing questionId', () => {
      const result = submitHomeworkSchema.safeParse({
        answers: [{ answer: 'A' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('gradeSubmissionSchema', () => {
    it('validates valid grades', () => {
      const result = gradeSubmissionSchema.safeParse({
        grades: [
          { questionId: VALID_OID, marksAwarded: 5, isCorrect: true },
        ],
        feedback: 'Good work!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative marks', () => {
      const result = gradeSubmissionSchema.safeParse({
        grades: [
          { questionId: VALID_OID, marksAwarded: -1, isCorrect: false },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing grades', () => {
      const result = gradeSubmissionSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
