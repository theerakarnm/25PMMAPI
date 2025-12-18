import { z } from 'zod';
import { insertInteractionLogSchema } from '../../core/database/schema/interaction-logs.js';

// API Request/Response schemas
export const createInteractionLogRequestSchema = insertInteractionLogSchema;

export const updateInteractionLogRequestSchema = z.object({
  status: z.enum(['sent', 'delivered', 'read', 'responded', 'missed']).optional(),
  deliveredAt: z.string().datetime().optional(),
  respondedAt: z.string().datetime().optional(),
  responseValue: z.string().optional(),
  responseAction: z.string().optional(),
});

export const interactionLogQuerySchema = z.object({
  status: z.enum(['sent', 'delivered', 'read', 'responded', 'missed']).optional(),
  userId: z.string().uuid().optional(),
  protocolId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export const researchDataExportQuerySchema = z.object({
  protocolId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// Response types
export interface InteractionLogResponse {
  id: string;
  userId: string;
  protocolId: string;
  stepId: string;
  assignmentId: string;
  messageId: string | null;
  sentAt: Date;
  deliveredAt: Date | null;
  respondedAt: Date | null;
  responseValue: string | null;
  responseAction: string | null;
  timeDifferenceMs: number | null;
  status: 'sent' | 'delivered' | 'read' | 'responded' | 'missed';
  createdAt: Date;
}

export interface InteractionLogWithDetailsResponse extends InteractionLogResponse {
  user: {
    displayName: string;
    realName: string | null;
  } | null;
  protocol: {
    name: string;
  } | null;
  step: {
    stepOrder: string;
    messageType: string;
  } | null;
}

export interface InteractionLogStatsResponse {
  total: number;
  sent: number;
  delivered: number;
  responded: number;
  missed: number;
  averageResponseTime: number;
}

export interface ResearchDataExportResponse {
  patientId: string | null;
  protocolName: string | null;
  stepId: string;
  stepOrder: string | null;
  messageSentTime: Date;
  actionTime: Date | null;
  status: string;
  timeDifferenceMs: number | null;
  responseValue: string | null;
}

export interface ProtocolAdherenceMetricsResponse {
  totalMessages: number;
  respondedMessages: number;
  adherenceRate: number;
  averageResponseTime: number;
  stepMetrics: Array<{
    stepOrder: number;
    sentCount: number;
    responseCount: number;
    adherenceRate: number;
    averageResponseTime: number;
  }>;
}

// Type exports
export type CreateInteractionLogRequest = z.infer<typeof createInteractionLogRequestSchema>;
export type UpdateInteractionLogRequest = z.infer<typeof updateInteractionLogRequestSchema>;
export type InteractionLogQuery = z.infer<typeof interactionLogQuerySchema>;
export type ResearchDataExportQuery = z.infer<typeof researchDataExportQuerySchema>;