import { z } from 'zod';
import { 
  feedbackConfigSchema,
  insertProtocolSchema,
  insertProtocolStepSchema 
} from '../../core/database/schema/protocols.js';

// API Request/Response schemas
export const createProtocolRequestSchema = insertProtocolSchema;

export const updateProtocolRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
});

export const createProtocolStepRequestSchema = insertProtocolStepSchema;

export const updateProtocolStepRequestSchema = z.object({
  stepOrder: z.string().min(1).optional(),
  triggerType: z.enum(['immediate', 'delay', 'scheduled']).optional(),
  triggerValue: z.string().min(1).optional(),
  messageType: z.enum(['text', 'image', 'link', 'flex']).optional(),
  contentPayload: z.any().optional(),
  requiresAction: z.boolean().optional(),
  feedbackConfig: feedbackConfigSchema.optional(),
});

export const protocolQuerySchema = z.object({
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  createdBy: z.string().uuid().optional(),
});

// Response types
export interface ProtocolResponse {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  stepCount?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProtocolStepResponse {
  id: string;
  protocolId: string;
  stepOrder: string;
  triggerType: 'immediate' | 'delay' | 'scheduled';
  triggerValue: string;
  messageType: 'text' | 'image' | 'link' | 'flex';
  contentPayload: any;
  requiresAction: boolean;
  feedbackConfig: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProtocolValidationResponse {
  isValid: boolean;
  errors: string[];
}

export interface ProtocolWithStepsResponse extends ProtocolResponse {
  steps: ProtocolStepResponse[];
}

// Type exports
export type CreateProtocolRequest = z.infer<typeof createProtocolRequestSchema>;
export type UpdateProtocolRequest = z.infer<typeof updateProtocolRequestSchema>;
export type CreateProtocolStepRequest = z.infer<typeof createProtocolStepRequestSchema>;
export type UpdateProtocolStepRequest = z.infer<typeof updateProtocolStepRequestSchema>;
export type ProtocolQuery = z.infer<typeof protocolQuerySchema>;