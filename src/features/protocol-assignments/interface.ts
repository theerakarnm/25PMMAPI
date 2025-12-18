import { z } from 'zod';
import { insertProtocolAssignmentSchema } from '../../core/database/schema/protocol-assignments.js';

// API Request/Response schemas
export const createProtocolAssignmentRequestSchema = z.object({
  userId: z.string().uuid(),
  protocolId: z.string().uuid(),
  assignedAt: z.string().datetime().optional(),
});

export const updateProtocolAssignmentRequestSchema = z.object({
  currentStep: z.number().int().min(0).optional(),
  status: z.enum(['assigned', 'active', 'completed', 'paused']).optional(),
  completedSteps: z.number().int().min(0).optional(),
});

export const protocolAssignmentQuerySchema = z.object({
  status: z.enum(['assigned', 'active', 'completed', 'paused']).optional(),
  userId: z.string().uuid().optional(),
  protocolId: z.string().uuid().optional(),
});

// Response types
export interface ProtocolAssignmentResponse {
  id: string;
  userId: string;
  protocolId: string;
  assignedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  currentStep: number;
  status: 'assigned' | 'active' | 'completed' | 'paused';
  totalSteps: number;
  completedSteps: number;
  adherenceRate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProtocolAssignmentWithDetailsResponse extends ProtocolAssignmentResponse {
  user: {
    displayName: string;
    realName: string | null;
  };
  protocol: {
    name: string;
  };
}

export interface ProtocolAssignmentStatsResponse {
  total: number;
  assigned: number;
  active: number;
  completed: number;
  paused: number;
  averageAdherenceRate: number;
}

// Type exports
export type CreateProtocolAssignmentRequest = z.infer<typeof createProtocolAssignmentRequestSchema>;
export type UpdateProtocolAssignmentRequest = z.infer<typeof updateProtocolAssignmentRequestSchema>;
export type ProtocolAssignmentQuery = z.infer<typeof protocolAssignmentQuerySchema>;