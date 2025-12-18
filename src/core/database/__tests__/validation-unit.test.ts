import { test, expect, describe } from "bun:test";
import { z } from 'zod';

describe('Data Validation Unit Tests', () => {
  test('should validate user schema correctly', () => {
    const userSchema = z.object({
      lineUserId: z.string().min(1, 'LINE User ID is required'),
      displayName: z.string().min(1, 'Display name is required').max(255, 'Display name too long'),
      pictureUrl: z.string().url('Invalid picture URL').optional().or(z.literal('')),
      realName: z.string().max(255, 'Real name too long').optional(),
      hospitalNumber: z.string().max(100, 'Hospital number too long').optional(),
      status: z.enum(['active', 'inactive'], {
        errorMap: () => ({ message: 'Status must be either active or inactive' })
      }).optional()
    });

    // Valid user data
    const validUserData = {
      lineUserId: 'valid-line-user-id',
      displayName: 'Valid User',
      pictureUrl: 'https://example.com/picture.jpg',
      status: 'active' as const
    };

    const validResult = userSchema.safeParse(validUserData);
    expect(validResult.success).toBe(true);

    // Invalid user data
    const invalidUserData = {
      lineUserId: '', // Invalid: empty
      displayName: 'Valid User',
      pictureUrl: 'invalid-url', // Invalid: not a URL
      status: 'invalid-status' // Invalid: not in enum
    };

    const invalidResult = userSchema.safeParse(invalidUserData);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.errors.length).toBeGreaterThan(0);
    }
  });

  test('should validate protocol schema correctly', () => {
    const protocolSchema = z.object({
      name: z.string().min(1, 'Protocol name is required').max(255, 'Protocol name too long'),
      description: z.string().max(1000, 'Description too long').optional(),
      createdBy: z.string().uuid('Invalid admin ID'),
      status: z.enum(['draft', 'active', 'paused', 'completed'], {
        errorMap: () => ({ message: 'Invalid protocol status' })
      }).optional()
    });

    // Valid protocol data
    const validProtocolData = {
      name: 'Valid Protocol',
      description: 'A valid protocol description',
      createdBy: '123e4567-e89b-12d3-a456-426614174000',
      status: 'draft' as const
    };

    const validResult = protocolSchema.safeParse(validProtocolData);
    expect(validResult.success).toBe(true);

    // Invalid protocol data
    const invalidProtocolData = {
      name: '', // Invalid: empty
      createdBy: 'invalid-admin-id', // Invalid: not UUID
      status: 'invalid-status' // Invalid: not in enum
    };

    const invalidResult = protocolSchema.safeParse(invalidProtocolData);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.errors.length).toBeGreaterThan(0);
    }
  });

  test('should validate protocol step schema correctly', () => {
    const stepSchema = z.object({
      protocolId: z.string().uuid('Invalid protocol ID'),
      stepOrder: z.string().min(1, 'Step order is required'),
      triggerType: z.enum(['immediate', 'delay', 'scheduled'], {
        errorMap: () => ({ message: 'Invalid trigger type' })
      }),
      triggerValue: z.string().min(1, 'Trigger value is required'),
      messageType: z.enum(['text', 'image', 'link', 'flex'], {
        errorMap: () => ({ message: 'Invalid message type' })
      }),
      contentPayload: z.any(),
      requiresAction: z.boolean().optional(),
      feedbackConfig: z.object({
        question: z.string().min(1, 'Feedback question is required'),
        buttons: z.array(z.object({
          label: z.string().min(1, 'Button label is required'),
          value: z.string().min(1, 'Button value is required'),
          action: z.enum(['complete', 'postpone', 'skip'])
        })).min(1, 'At least one button is required').max(5, 'Maximum 5 buttons allowed')
      }).optional()
    });

    // Valid step data
    const validStepData = {
      protocolId: '123e4567-e89b-12d3-a456-426614174000',
      stepOrder: '1',
      triggerType: 'delay' as const,
      triggerValue: '1h',
      messageType: 'text' as const,
      contentPayload: 'Valid message content',
      requiresAction: false
    };

    const validResult = stepSchema.safeParse(validStepData);
    expect(validResult.success).toBe(true);

    // Invalid step data
    const invalidStepData = {
      protocolId: 'invalid-protocol-id', // Invalid: not UUID
      stepOrder: '', // Invalid: empty
      triggerType: 'invalid-trigger', // Invalid: not in enum
      triggerValue: '',
      messageType: 'invalid-type', // Invalid: not in enum
      contentPayload: ''
    };

    const invalidResult = stepSchema.safeParse(invalidStepData);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.errors.length).toBeGreaterThan(0);
    }
  });

  test('should validate trigger value patterns', () => {
    // Test delay pattern
    const delayPattern = /^\d+[smhd]$/;
    expect(delayPattern.test('1h')).toBe(true);
    expect(delayPattern.test('30m')).toBe(true);
    expect(delayPattern.test('2d')).toBe(true);
    expect(delayPattern.test('invalid')).toBe(false);

    // Test time pattern
    const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    expect(timePattern.test('09:00')).toBe(true);
    expect(timePattern.test('14:30')).toBe(true);
    expect(timePattern.test('23:59')).toBe(true);
    expect(timePattern.test('25:00')).toBe(false);
    expect(timePattern.test('invalid')).toBe(false);
  });

  test('should validate hospital number pattern', () => {
    const hnPattern = /^HN\d{6,10}$/;
    expect(hnPattern.test('HN123456')).toBe(true);
    expect(hnPattern.test('HN1234567890')).toBe(true);
    expect(hnPattern.test('HN12345')).toBe(false); // Too short
    expect(hnPattern.test('HN12345678901')).toBe(false); // Too long
    expect(hnPattern.test('invalid')).toBe(false);
  });

  test('should validate feedback configuration', () => {
    const feedbackConfigSchema = z.object({
      question: z.string().min(1, 'Feedback question is required'),
      buttons: z.array(z.object({
        label: z.string().min(1, 'Button label is required'),
        value: z.string().min(1, 'Button value is required'),
        action: z.enum(['complete', 'postpone', 'skip'])
      })).min(1, 'At least one button is required').max(5, 'Maximum 5 buttons allowed')
    });

    // Valid feedback config
    const validConfig = {
      question: 'Have you completed this task?',
      buttons: [
        { label: 'เรียบร้อยแล้ว', value: 'completed', action: 'complete' as const },
        { label: 'ยังไม่ทำ', value: 'not_done', action: 'postpone' as const }
      ]
    };

    const validResult = feedbackConfigSchema.safeParse(validConfig);
    expect(validResult.success).toBe(true);

    // Invalid feedback config - too many buttons
    const invalidConfig = {
      question: 'Test question',
      buttons: Array(6).fill(0).map((_, i) => ({
        label: `Button ${i}`,
        value: `value_${i}`,
        action: 'complete' as const
      }))
    };

    const invalidResult = feedbackConfigSchema.safeParse(invalidConfig);
    expect(invalidResult.success).toBe(false);
  });
});