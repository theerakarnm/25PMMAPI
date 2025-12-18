import { eq, desc, count, isNull, and, gte, lte, avg, sql, max } from 'drizzle-orm';
import { database } from '../../core/database/connection.js';
import { DatabaseError } from '../../core/errors/app-error.js';
import { 
  users, 
  protocols, 
  protocolSteps, 
  protocolAssignments, 
  interactionLogs 
} from '../../core/database/schema.js';
import type { 
  DashboardMetricsResponse,
  AdherenceMetricsResponse,
  StepMetricResponse,
  PatientListResponse,
  ResearchDataExportResponse,
  ResearchQuery
} from './interface.js';

export class ResearchRepository {
  private db = database;

  async getDashboardMetrics(): Promise<DashboardMetricsResponse> {
    try {
      // Get total and active patients
      const [totalPatientsResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(isNull(users.deletedAt));

      const [activePatientsResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.status, 'active'),
          isNull(users.deletedAt)
        ));

      // Get total and active protocols
      const [totalProtocolsResult] = await this.db
        .select({ count: count() })
        .from(protocols)
        .where(isNull(protocols.deletedAt));

      const [activeProtocolsResult] = await this.db
        .select({ count: count() })
        .from(protocols)
        .where(and(
          eq(protocols.status, 'active'),
          isNull(protocols.deletedAt)
        ));

      // Get interaction statistics
      const [totalInteractionsResult] = await this.db
        .select({ count: count() })
        .from(interactionLogs);

      const [respondedInteractionsResult] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(eq(interactionLogs.status, 'responded'));

      // Get average response time
      const [avgResponseTimeResult] = await this.db
        .select({ 
          avgTime: avg(interactionLogs.timeDifferenceMs) 
        })
        .from(interactionLogs)
        .where(eq(interactionLogs.status, 'responded'));

      const totalPatients = totalPatientsResult?.count || 0;
      const activePatients = activePatientsResult?.count || 0;
      const totalProtocols = totalProtocolsResult?.count || 0;
      const activeProtocols = activeProtocolsResult?.count || 0;
      const totalInteractions = totalInteractionsResult?.count || 0;
      const respondedInteractions = respondedInteractionsResult?.count || 0;
      const averageResponseTime = Number(avgResponseTimeResult?.avgTime) || 0;

      const overallAdherenceRate = totalInteractions > 0 
        ? (respondedInteractions / totalInteractions) * 100 
        : 0;

      return {
        totalPatients,
        activePatients,
        totalProtocols,
        activeProtocols,
        overallAdherenceRate,
        averageResponseTime,
        totalInteractions,
        respondedInteractions,
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch dashboard metrics', error);
    }
  }

  async getAdherenceMetrics(protocolId: string): Promise<AdherenceMetricsResponse> {
    try {
      // Get protocol information
      const [protocol] = await this.db
        .select()
        .from(protocols)
        .where(eq(protocols.id, protocolId))
        .limit(1);

      if (!protocol) {
        throw new DatabaseError('Protocol not found');
      }

      // Get patient counts for this protocol
      const [totalPatientsResult] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(eq(protocolAssignments.protocolId, protocolId));

      const [activePatientsResult] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.protocolId, protocolId),
          eq(protocolAssignments.status, 'active')
        ));

      // Get completion rate
      const [completedAssignmentsResult] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.protocolId, protocolId),
          eq(protocolAssignments.status, 'completed')
        ));

      // Get average response time for this protocol
      const [avgResponseTimeResult] = await this.db
        .select({ 
          avgTime: avg(interactionLogs.timeDifferenceMs) 
        })
        .from(interactionLogs)
        .where(and(
          eq(interactionLogs.protocolId, protocolId),
          eq(interactionLogs.status, 'responded')
        ));

      // Get step metrics
      const stepMetrics = await this.getStepMetrics(protocolId);

      const totalPatients = totalPatientsResult?.count || 0;
      const activePatients = activePatientsResult?.count || 0;
      const completedAssignments = completedAssignmentsResult?.count || 0;
      const completionRate = totalPatients > 0 ? (completedAssignments / totalPatients) * 100 : 0;
      const averageResponseTime = Number(avgResponseTimeResult?.avgTime) || 0;

      return {
        protocolId: protocol.id,
        protocolName: protocol.name,
        totalPatients,
        activePatients,
        completionRate,
        averageResponseTime,
        stepMetrics,
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch adherence metrics', error);
    }
  }

  private async getStepMetrics(protocolId: string): Promise<StepMetricResponse[]> {
    try {
      // Get all steps for the protocol
      const steps = await this.db
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId))
        .orderBy(protocolSteps.stepOrder);

      const stepMetrics: StepMetricResponse[] = [];

      for (const step of steps) {
        // Get sent count for this step
        const [sentCountResult] = await this.db
          .select({ count: count() })
          .from(interactionLogs)
          .where(eq(interactionLogs.stepId, step.id));

        // Get response count for this step
        const [responseCountResult] = await this.db
          .select({ count: count() })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.stepId, step.id),
            eq(interactionLogs.status, 'responded')
          ));

        // Get average response time for this step
        const [avgResponseTimeResult] = await this.db
          .select({ 
            avgTime: avg(interactionLogs.timeDifferenceMs) 
          })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.stepId, step.id),
            eq(interactionLogs.status, 'responded')
          ));

        const sentCount = sentCountResult?.count || 0;
        const responseCount = responseCountResult?.count || 0;
        const adherenceRate = sentCount > 0 ? (responseCount / sentCount) * 100 : 0;
        const averageResponseTime = Number(avgResponseTimeResult?.avgTime) || 0;

        stepMetrics.push({
          stepId: step.id,
          stepOrder: step.stepOrder,
          messageType: step.messageType,
          sentCount,
          responseCount,
          adherenceRate,
          averageResponseTime,
        });
      }

      return stepMetrics;
    } catch (error) {
      throw new DatabaseError('Failed to fetch step metrics', error);
    }
  }

  async getPatientList(): Promise<PatientListResponse[]> {
    try {
      const patients = await this.db
        .select({
          id: users.id,
          displayName: users.displayName,
          realName: users.realName,
          hospitalNumber: users.hospitalNumber,
          status: users.status,
          joinedAt: users.joinedAt,
          lastInteraction: max(interactionLogs.sentAt),
          activeProtocols: count(protocolAssignments.id),
          avgAdherence: avg(sql`CAST(${protocolAssignments.adherenceRate} AS DECIMAL)`),
        })
        .from(users)
        .leftJoin(interactionLogs, eq(users.id, interactionLogs.userId))
        .leftJoin(protocolAssignments, and(
          eq(users.id, protocolAssignments.userId),
          eq(protocolAssignments.status, 'active')
        ))
        .where(isNull(users.deletedAt))
        .groupBy(
          users.id,
          users.displayName,
          users.realName,
          users.hospitalNumber,
          users.status,
          users.joinedAt
        )
        .orderBy(desc(users.joinedAt));

      return patients.map(patient => ({
        id: patient.id,
        displayName: patient.displayName,
        realName: patient.realName,
        hospitalNumber: patient.hospitalNumber,
        status: patient.status,
        joinedAt: patient.joinedAt,
        lastInteraction: patient.lastInteraction,
        activeProtocols: patient.activeProtocols || 0,
        overallAdherenceRate: Number(patient.avgAdherence) || 0,
      }));
    } catch (error) {
      throw new DatabaseError('Failed to fetch patient list', error);
    }
  }

  async exportResearchData(filter: ResearchQuery = {}): Promise<ResearchDataExportResponse[]> {
    try {
      const conditions = [];
      
      if (filter.protocolId) {
        conditions.push(eq(interactionLogs.protocolId, filter.protocolId));
      }
      
      if (filter.userId) {
        conditions.push(eq(interactionLogs.userId, filter.userId));
      }
      
      if (filter.dateFrom) {
        conditions.push(gte(interactionLogs.sentAt, new Date(filter.dateFrom)));
      }
      
      if (filter.dateTo) {
        conditions.push(lte(interactionLogs.sentAt, new Date(filter.dateTo)));
      }

      if (filter.status) {
        conditions.push(eq(interactionLogs.status, filter.status));
      }

      return await this.db
        .select({
          patientId: users.lineUserId,
          protocolName: protocols.name,
          stepId: interactionLogs.stepId,
          stepOrder: protocolSteps.stepOrder,
          messageSentTime: interactionLogs.sentAt,
          actionTime: interactionLogs.respondedAt,
          status: sql<string>`CASE 
            WHEN ${interactionLogs.status} = 'responded' THEN 'Done'
            ELSE 'Missed'
          END`,
          timeDifferenceMs: interactionLogs.timeDifferenceMs,
          responseValue: interactionLogs.responseValue,
        })
        .from(interactionLogs)
        .leftJoin(users, eq(interactionLogs.userId, users.id))
        .leftJoin(protocols, eq(interactionLogs.protocolId, protocols.id))
        .leftJoin(protocolSteps, eq(interactionLogs.stepId, protocolSteps.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(interactionLogs.sentAt));
    } catch (error) {
      throw new DatabaseError('Failed to export research data', error);
    }
  }
}