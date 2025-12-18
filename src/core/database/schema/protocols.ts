import { z } from 'zod';
import { protocols, protocolSteps } from '../schema.js';

// Zod schemas for feedback configuration
export const feedbackButtonSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  action: z.enum(['complete', 'postpone', 'skip']),
});

export const feedbackConfigSchema = z.object({
  question: z.string().min(1),
  buttons: z.array(feedbackButtonSchema).min(1).max(5),
});

export const insertProtocolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  createdBy: z.string().uuid(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
});

export const selectProtocolSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdBy: z.string().uuid(),
  status: z.enum(['draft', 'active', 'paused', 'completed']),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const insertProtocolStepSchema = z.object({
  protocolId: z.string().uuid(),
  stepOrder: z.string().min(1),
  triggerType: z.enum(['immediate', 'delay', 'scheduled']),
  triggerValue: z.string().min(1),
  messageType: z.enum(['text', 'image', 'link', 'flex']),
  contentPayload: z.any(),
  requiresAction: z.boolean().optional(),
  feedbackConfig: feedbackConfigSchema.optional(),
});

export const selectProtocolStepSchema = z.object({
  id: z.string().uuid(),
  protocolId: z.string().uuid(),
  stepOrder: z.string(),
  triggerType: z.enum(['immediate', 'delay', 'scheduled']),
  triggerValue: z.string(),
  messageType: z.enum(['text', 'image', 'link', 'flex']),
  contentPayload: z.any(),
  requiresAction: z.boolean(),
  feedbackConfig: feedbackConfigSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Protocol = typeof protocols.$inferSelect;
export type NewProtocol = typeof protocols.$inferInsert;
export type ProtocolStep = typeof protocolSteps.$inferSelect;
export type NewProtocolStep = typeof protocolSteps.$inferInsert;
export type FeedbackConfig = z.infer<typeof feedbackConfigSchema>;
export type FeedbackButton = z.infer<typeof feedbackButtonSchema>;