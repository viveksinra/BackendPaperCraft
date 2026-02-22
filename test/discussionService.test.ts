import './testSetup';
import { describe, it, expect } from 'vitest';
import {
  createThreadSchema,
  updateThreadSchema,
  createReplySchema,
  editReplySchema,
  listThreadsSchema,
  listRepliesSchema,
} from '../src/shared/validation/discussionValidation';

const VALID_OID = '507f1f77bcf86cd799439011';
const VALID_OID2 = '507f1f77bcf86cd799439012';

describe('Discussion Validation', () => {
  describe('createThreadSchema', () => {
    it('validates a valid thread', () => {
      const result = createThreadSchema.safeParse({
        title: 'Help with algebra',
        body: 'I need help understanding quadratic equations.',
      });
      expect(result.success).toBe(true);
    });

    it('rejects title shorter than 3 characters', () => {
      const result = createThreadSchema.safeParse({
        title: 'Hi',
        body: 'Some content here',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty body', () => {
      const result = createThreadSchema.safeParse({
        title: 'A valid title',
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const result = createThreadSchema.safeParse({
        body: 'Some content',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing body', () => {
      const result = createThreadSchema.safeParse({
        title: 'A valid title',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional category and tags', () => {
      const result = createThreadSchema.safeParse({
        title: 'Help with algebra',
        body: 'I need help.',
        category: 'homework',
        tags: ['math', 'algebra'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid categories', () => {
      const categories = ['general', 'homework', 'test', 'course', 'announcement', 'question', 'feedback'];
      for (const category of categories) {
        const result = createThreadSchema.safeParse({
          title: 'Test thread',
          body: 'Test body content.',
          category,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid category', () => {
      const result = createThreadSchema.safeParse({
        title: 'Test thread',
        body: 'Test body.',
        category: 'invalid_category',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional classId and courseId', () => {
      const result = createThreadSchema.safeParse({
        title: 'Help with algebra',
        body: 'I need help.',
        classId: VALID_OID,
        courseId: VALID_OID2,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateThreadSchema', () => {
    it('validates partial update', () => {
      const result = updateThreadSchema.safeParse({
        title: 'Updated title here',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = updateThreadSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects title shorter than 3 characters', () => {
      const result = updateThreadSchema.safeParse({
        title: 'Hi',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createReplySchema', () => {
    it('validates a valid reply', () => {
      const result = createReplySchema.safeParse({
        body: 'This is a reply.',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body', () => {
      const result = createReplySchema.safeParse({
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing body', () => {
      const result = createReplySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts optional parentReplyId', () => {
      const result = createReplySchema.safeParse({
        body: 'Nested reply',
        parentReplyId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('editReplySchema', () => {
    it('validates a valid edit', () => {
      const result = editReplySchema.safeParse({
        body: 'Updated reply content.',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body', () => {
      const result = editReplySchema.safeParse({
        body: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listThreadsSchema', () => {
    it('validates valid query', () => {
      const result = listThreadsSchema.safeParse({
        category: 'homework',
        search: 'algebra',
        sortBy: 'newest',
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty query with defaults', () => {
      const result = listThreadsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts all valid sortBy options', () => {
      for (const sortBy of ['newest', 'popular', 'most_replies', 'most_upvotes']) {
        const result = listThreadsSchema.safeParse({ sortBy });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid sortBy', () => {
      const result = listThreadsSchema.safeParse({
        sortBy: 'oldest',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid status options', () => {
      for (const status of ['open', 'closed', 'pinned', 'archived']) {
        const result = listThreadsSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional classId and courseId filters', () => {
      const result = listThreadsSchema.safeParse({
        classId: VALID_OID,
        courseId: VALID_OID2,
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional authorId filter', () => {
      const result = listThreadsSchema.safeParse({
        authorId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('listRepliesSchema', () => {
    it('validates valid pagination', () => {
      const result = listRepliesSchema.safeParse({
        page: 1,
        pageSize: 50,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty params with defaults', () => {
      const result = listRepliesSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
