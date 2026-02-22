import { describe, it, expect } from 'vitest';
import { createClassSchema, updateClassSchema, addStudentsSchema, addTeacherSchema } from '../src/shared/validation/classValidation';

describe('classValidation', () => {
  describe('createClassSchema', () => {
    it('validates a minimal valid class', () => {
      const result = createClassSchema.safeParse({ name: 'Year 5 Maths' });
      expect(result.success).toBe(true);
    });

    it('validates a full valid class', () => {
      const result = createClassSchema.safeParse({
        name: 'Year 5 Maths',
        description: 'Weekly maths class',
        yearGroup: 'Year 5',
        subject: 'Mathematics',
        schedule: {
          dayOfWeek: ['Monday', 'Wednesday'],
          time: '10:00-11:00',
          location: 'Room 101',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = createClassSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name over 200 chars', () => {
      const result = createClassSchema.safeParse({ name: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('rejects invalid dayOfWeek', () => {
      const result = createClassSchema.safeParse({
        name: 'Test',
        schedule: { dayOfWeek: ['InvalidDay'] },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateClassSchema', () => {
    it('validates partial updates', () => {
      const result = updateClassSchema.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
    });

    it('validates empty object', () => {
      const result = updateClassSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('addStudentsSchema', () => {
    it('validates valid student IDs', () => {
      const result = addStudentsSchema.safeParse({
        studentUserIds: ['507f1f77bcf86cd799439011'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty array', () => {
      const result = addStudentsSchema.safeParse({ studentUserIds: [] });
      expect(result.success).toBe(false);
    });

    it('rejects more than 100 students', () => {
      const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
      const result = addStudentsSchema.safeParse({ studentUserIds: ids });
      expect(result.success).toBe(false);
    });
  });

  describe('addTeacherSchema', () => {
    it('validates valid teacher ID', () => {
      const result = addTeacherSchema.safeParse({
        teacherUserId: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty ID', () => {
      const result = addTeacherSchema.safeParse({ teacherUserId: '' });
      expect(result.success).toBe(false);
    });
  });
});
