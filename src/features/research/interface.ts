import { z } from 'zod';

// Research Dashboard Metrics Response
export interface DashboardMetricsResponse {
  totalPatients: number;
  activePatients: number;
  totalProtocols: number;
  activeProtocols: number;
  overallAdherenceRate: number;
  averageResponseTime: number;
  totalInteractions: number;
  respondedInteractions: number;
}

// Adherence Metrics Response
export interface AdherenceMetricsResponse {
  protocolId: string;
  protocolName: string;
  totalPatients: number;
  activePatients: number;
  completionRate: number;
  averageResponseTime: number;
  stepMetrics: StepMetricResponse[];
}

export interface StepMetricResponse {
  stepId: string;
  stepOrder: number;
  messageType: string;
  sentCount: number;
  responseCount: number;
  adherenceRate: number;
  averageResponseTime: number;
}

// Patient List Response
export interface PatientListResponse {
  id: string;
  displayName: string;
  realName: string | null;
  hospitalNumber: string | null;
  status: 'active' | 'inactive';
  joinedAt: Date;
  lastInteraction: Date | null;
  activeProtocols: number;
  overallAdherenceRate: number;
}

// Research Data Export Response
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

// Query Schemas
export const researchQuerySchema = z.object({
  protocolId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  status: z.enum(['sent', 'delivered', 'read', 'responded', 'missed']).optional(),
});

export const exportQuerySchema = z.object({
  protocolId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  format: z.enum(['csv', 'excel']).default('csv'),
});

export const adherenceQuerySchema = z.object({
  protocolId: z.string().uuid(),
});

export type ResearchQuery = z.infer<typeof researchQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
export type AdherenceQuery = z.infer<typeof adherenceQuerySchema>;