import { z } from 'zod';
import { feedbackConfigSchema } from '../../core/database/schema/protocols.js';

// Request schemas for feedback operations
export const sendFeedbackMessageRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  protocolId: z.string().uuid('Invalid protocol ID format'),
  stepId: z.string().uuid('Invalid step ID format'),
  messageContent: z.object({
    type: z.enum(['text', 'image', 'flex', 'link']),
    payload: z.any(),
  }),
  feedbackConfig: feedbackConfigSchema,
});

export const processFeedbackResponseRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  protocolId: z.string().uuid('Invalid protocol ID format'),
  stepId: z.string().uuid('Invalid step ID format'),
  assignmentId: z.string().uuid('Invalid assignment ID format'),
  responseValue: z.string().min(1, 'Response value is required'),
  responseAction: z.string().min(1, 'Response action is required'),
  originalSentAt: z.date(),
});

export const validateFeedbackConfigRequestSchema = z.object({
  feedbackConfig: feedbackConfigSchema,
});

// Response interfaces
export interface FeedbackMessageResponse {
  messageId?: string;
  sentAt: Date;
  requiresResponse: boolean;
  feedbackConfig: any;
}

export interface FeedbackProcessingResponse {
  interactionLogId: string;
  confirmationSent: boolean;
  confirmationMessage: string;
  timeDifferenceMs: number;
  status: 'responded' | 'failed';
}

export interface FeedbackValidationResponse {
  isValid: boolean;
  errors: string[];
  suggestions?: string[];
}

// Type exports
export type SendFeedbackMessageRequest = z.infer<typeof sendFeedbackMessageRequestSchema>;
export type ProcessFeedbackResponseRequest = z.infer<typeof processFeedbackResponseRequestSchema>;
export type ValidateFeedbackConfigRequest = z.infer<typeof validateFeedbackConfigRequestSchema>;