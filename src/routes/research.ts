import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ResearchService } from '../features/research/domain.js';
import { 
  researchQuerySchema,
  exportQuerySchema,
  adherenceQuerySchema,
  type DashboardMetricsResponse,
  type AdherenceMetricsResponse,
  type PatientListResponse,
  type ResearchDataExportResponse
} from '../features/research/interface.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { AppError, NotFoundError } from '../core/errors/app-error.js';
import { authMiddleware } from '../middleware/auth.js';

const research = new Hono();
const researchService = new ResearchService();

// Apply authentication middleware to all research routes
research.use('*', authMiddleware);

// GET /research/metrics - Get dashboard overview metrics
research.get(
  '/metrics',
  async (c) => {
    try {
      const metrics = await researchService.getDashboardMetrics();
      
      const response: DashboardMetricsResponse = {
        totalPatients: metrics.totalPatients,
        activePatients: metrics.activePatients,
        totalProtocols: metrics.totalProtocols,
        activeProtocols: metrics.activeProtocols,
        overallAdherenceRate: metrics.overallAdherenceRate,
        averageResponseTime: metrics.averageResponseTime,
        totalInteractions: metrics.totalInteractions,
        respondedInteractions: metrics.respondedInteractions,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch dashboard metrics');
    }
  }
);

// GET /research/adherence/:protocolId - Get adherence metrics for a specific protocol
research.get(
  '/adherence/:protocolId',
  zValidator('param', adherenceQuerySchema),
  async (c) => {
    try {
      const { protocolId } = c.req.valid('param');
      const adherenceMetrics = await researchService.getAdherenceMetrics(protocolId);
      
      const response: AdherenceMetricsResponse = {
        protocolId: adherenceMetrics.protocolId,
        protocolName: adherenceMetrics.protocolName,
        totalPatients: adherenceMetrics.totalPatients,
        activePatients: adherenceMetrics.activePatients,
        completionRate: adherenceMetrics.completionRate,
        averageResponseTime: adherenceMetrics.averageResponseTime,
        stepMetrics: adherenceMetrics.stepMetrics,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch adherence metrics');
    }
  }
);

// GET /research/patients - Get patient list with status and adherence data
research.get(
  '/patients',
  async (c) => {
    try {
      const patients = await researchService.getPatientList();
      
      const response: PatientListResponse[] = patients.map(patient => ({
        id: patient.id,
        displayName: patient.displayName,
        realName: patient.realName,
        hospitalNumber: patient.hospitalNumber,
        status: patient.status,
        joinedAt: patient.joinedAt,
        lastInteraction: patient.lastInteraction,
        activeProtocols: patient.activeProtocols,
        overallAdherenceRate: patient.overallAdherenceRate,
      }));

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch patient list');
    }
  }
);

// POST /research/export - Export research data as CSV/Excel
research.post(
  '/export',
  zValidator('json', exportQuerySchema),
  async (c) => {
    try {
      const query = c.req.valid('json');
      const data = await researchService.exportResearchData(query);
      
      if (query.format === 'csv') {
        const csvContent = await researchService.generateCSV(data);
        
        c.header('Content-Type', 'text/csv');
        c.header('Content-Disposition', 'attachment; filename="research-data.csv"');
        
        return c.text(csvContent);
      } else {
        // For Excel format, return JSON data that frontend can convert
        const response: ResearchDataExportResponse[] = data.map(row => ({
          patientId: row.patientId,
          protocolName: row.protocolName,
          stepId: row.stepId,
          stepOrder: row.stepOrder,
          messageSentTime: row.messageSentTime,
          actionTime: row.actionTime,
          status: row.status,
          timeDifferenceMs: row.timeDifferenceMs,
          responseValue: row.responseValue,
        }));

        c.header('Content-Type', 'application/json');
        c.header('Content-Disposition', 'attachment; filename="research-data.json"');
        
        return ResponseBuilder.success(c, response);
      }
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to export research data');
    }
  }
);

// GET /research/export - Get research data for export (query parameters)
research.get(
  '/export',
  zValidator('query', researchQuerySchema),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const data = await researchService.exportResearchData(query);
      
      const response: ResearchDataExportResponse[] = data.map(row => ({
        patientId: row.patientId,
        protocolName: row.protocolName,
        stepId: row.stepId,
        stepOrder: row.stepOrder,
        messageSentTime: row.messageSentTime,
        actionTime: row.actionTime,
        status: row.status,
        timeDifferenceMs: row.timeDifferenceMs,
        responseValue: row.responseValue,
      }));

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch research data');
    }
  }
);

// GET /research/adherence-rate/:protocolId - Calculate adherence rate for a protocol
research.get(
  '/adherence-rate/:protocolId',
  zValidator('param', adherenceQuerySchema),
  async (c) => {
    try {
      const { protocolId } = c.req.valid('param');
      const adherenceRate = await researchService.calculateAdherenceRate(protocolId);
      
      return ResponseBuilder.success(c, { 
        protocolId,
        adherenceRate: Math.round(adherenceRate * 100) / 100 // Round to 2 decimal places
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to calculate adherence rate');
    }
  }
);

export default research;