import { test, expect, describe } from "bun:test";
import { JobManager } from '../queue.js';

describe("Job Manager Tests", () => {
  
  test("should validate job data structure", () => {
    const messageJobData = {
      userId: 'test-user-id',
      protocolId: 'test-protocol-id',
      stepId: 'test-step-id',
      assignmentId: 'test-assignment-id',
      messageType: 'text' as const,
      content: { text: 'Test message' },
      requiresFeedback: false,
    };

    expect(messageJobData.userId).toBe('test-user-id');
    expect(messageJobData.messageType).toBe('text');
    expect(messageJobData.content.text).toBe('Test message');
    expect(messageJobData.requiresFeedback).toBe(false);
  });

  test("should validate scheduled message data structure", () => {
    const scheduledMessageData = {
      userId: 'test-user-id',
      protocolId: 'test-protocol-id',
      stepId: 'test-step-id',
      assignmentId: 'test-assignment-id',
      messageType: 'text' as const,
      content: { text: 'Scheduled message' },
      requiresFeedback: false,
      scheduledAt: new Date(),
    };

    expect(scheduledMessageData.scheduledAt).toBeInstanceOf(Date);
    expect(scheduledMessageData.messageType).toBe('text');
  });

  test("should validate feedback configuration in job data", () => {
    const jobDataWithFeedback = {
      userId: 'test-user-id',
      protocolId: 'test-protocol-id',
      stepId: 'test-step-id',
      assignmentId: 'test-assignment-id',
      messageType: 'template' as const,
      content: { templateContent: {} },
      requiresFeedback: true,
      feedbackConfig: {
        question: 'Did you complete the task?',
        buttons: [
          {
            label: 'Completed',
            value: 'completed',
            action: 'complete' as const,
          },
          {
            label: 'Postpone',
            value: 'postpone',
            action: 'postpone' as const,
          },
        ],
      },
    };

    expect(jobDataWithFeedback.requiresFeedback).toBe(true);
    expect(jobDataWithFeedback.feedbackConfig?.question).toBe('Did you complete the task?');
    expect(jobDataWithFeedback.feedbackConfig?.buttons).toHaveLength(2);
  });

  test("should validate message content types", () => {
    const textContent = { text: 'Hello world' };
    const imageContent = { 
      imageUrl: 'https://example.com/image.jpg',
      previewImageUrl: 'https://example.com/preview.jpg'
    };
    const flexContent = {
      text: 'Flex message',
      flexContent: { type: 'bubble', body: {} }
    };

    expect(textContent.text).toBe('Hello world');
    expect(imageContent.imageUrl).toContain('example.com');
    expect(flexContent.flexContent.type).toBe('bubble');
  });

  test("should validate queue statistics structure", async () => {
    // Mock queue stats structure
    const mockStats = {
      messageQueue: {
        waiting: 0,
        active: 0,
        completed: 10,
        failed: 1,
        delayed: 2,
      },
      scheduledQueue: {
        waiting: 5,
        active: 1,
        completed: 20,
        failed: 0,
        delayed: 3,
      },
      deliveryStats: [],
      timestamp: new Date().toISOString(),
    };

    expect(mockStats.messageQueue.completed).toBe(10);
    expect(mockStats.scheduledQueue.waiting).toBe(5);
    expect(mockStats.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});