import './testSetup';
import { describe, it, expect, vi } from 'vitest';
import {
  sendMessageSchema,
  listConversationsSchema,
  getConversationMessagesSchema,
  searchMessagesSchema,
  markConversationReadSchema,
} from '../src/shared/validation/messageValidation';

const VALID_OID = '507f1f77bcf86cd799439011';

describe('Message Validation', () => {
  describe('sendMessageSchema', () => {
    it('validates a valid message', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
        body: 'Hello teacher!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing recipientId', () => {
      const result = sendMessageSchema.safeParse({
        recipientRole: 'teacher',
        body: 'Hello',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid recipientRole', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'unknown',
        body: 'Hello',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid recipientRoles', () => {
      for (const role of ['teacher', 'student', 'parent', 'admin']) {
        const result = sendMessageSchema.safeParse({
          recipientId: VALID_OID,
          recipientRole: role,
          body: 'Hello',
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional subject', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
        body: 'Hello',
        subject: 'Question about homework',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional attachments', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
        body: 'See attached',
        attachments: [
          {
            name: 'doc.pdf',
            url: 'https://example.com/doc.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional parentMessageId', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
        body: 'Reply to your message',
        parentMessageId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing body', () => {
      const result = sendMessageSchema.safeParse({
        recipientId: VALID_OID,
        recipientRole: 'teacher',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listConversationsSchema', () => {
    it('validates pagination params', () => {
      const result = listConversationsSchema.safeParse({
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty params with defaults', () => {
      const result = listConversationsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects page less than 1', () => {
      const result = listConversationsSchema.safeParse({
        page: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getConversationMessagesSchema', () => {
    it('validates valid params', () => {
      const result = getConversationMessagesSchema.safeParse({
        otherUserId: VALID_OID,
        page: 1,
        pageSize: 50,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing otherUserId', () => {
      const result = getConversationMessagesSchema.safeParse({
        page: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('searchMessagesSchema', () => {
    it('validates valid search params', () => {
      const result = searchMessagesSchema.safeParse({
        query: 'homework',
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty query string', () => {
      const result = searchMessagesSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('markConversationReadSchema', () => {
    it('validates valid otherUserId', () => {
      const result = markConversationReadSchema.safeParse({
        otherUserId: VALID_OID,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing otherUserId', () => {
      const result = markConversationReadSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
