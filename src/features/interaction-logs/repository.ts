import { eq, desc, count, isNull, and, gte, lte, avg, sql } from 'drizzle-orm';
import { database } from '../../core/database/connection.js';
import { 
  type InteractionLog, 
  type NewInteractionLog
} from '../../core/database/schema/interaction-logs.js';
import { DatabaseError } from '../../core/errors/app-error.js';
import { interactionLogs, users, protocols, protocolSteps } from '../../core/database/schema.js';

export class InteractionLogRepository {
  private db = database;

  async create(logData: Omit<NewInteractionLog, 'id' | 'createdAt'>): Promise<InteractionLog> {
    try {
      const [log] = await this.db
        .insert(interactionLogs)
        .values({
          userId: logData.userId,
          protocolId: logData.protocolId,
          stepId: logData.stepId,
          assignmentId: logData.assignmentId,
          messageId: logData.messageId,
          sentAt: logData.sentAt,
          deliveredAt: logData.deliveredAt,
          respondedAt: logData.respondedAt,
          responseValue: logData.responseValue,
          responseAction: logData.responseAction,
          timeDifferenceMs: logData.timeDifferenceMs,
          status: logData.status || 'sent',
        })
        .returning();

      if (!log) {
        throw new DatabaseError('Failed to create interaction log');
      }

      return log;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Interaction log creation failed', error);
    }
  }

  async findById(id: string): Promise<InteractionLog | null> {
    try {
      const [log] = await this.db
        .select()
        .from(interactionLogs)
        .where(eq(interactionLogs.id, id))
        .limit(1);

      return log || null;
    } catch (error) {
      throw new DatabaseError('Failed to find interaction log by ID', error);
    }
  }

  async findByMessageId(messageId: string): Promise<InteractionLog | null> {
    try {
      const [log] = await this.db
        .select()
        .from(interactionLogs)
        .where(eq(interactionLogs.messageId, messageId))
        .limit(1);

      return log || null;
    } catch (error) {
      throw new DatabaseError('Failed to find interaction log by message ID', error);
    }
  }

  async findByUserId(userId: string, limit?: number): Promise<InteractionLog[]> {
    try {
      let query = this.db
        .select()
        .from(interactionLogs)
        .where(eq(interactionLogs.userId, userId))
        .orderBy(desc(interactionLogs.sentAt))
        .limit(limit ?? 999);

      return await query;
    } catch (error) {
      throw new DatabaseError('Failed to fetch interaction logs by user ID', error);
    }
  }

  async findByProtocolId(protocolId: string, limit?: number): Promise<InteractionLog[]> {
    try {
      let query = this.db
        .select()
        .from(interactionLogs)
        .where(eq(interactionLogs.protocolId, protocolId))
        .orderBy(desc(interactionLogs.sentAt))
        .limit(limit ?? 999);

      return await query;
    } catch (error) {
      throw new DatabaseError('Failed to fetch interaction logs by protocol ID', error);
    }
  }

  async findByAssignmentId(assignmentId: string): Promise<InteractionLog[]> {
    try {
      return await this.db
        .select()
        .from(interactionLogs)
        .where(eq(interactionLogs.assignmentId, assignmentId))
        .orderBy(desc(interactionLogs.sentAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch interaction logs by assignment ID', error);
    }
  }

  async findAll(filter: { 
    status?: 'sent' | 'delivered' | 'read' | 'responded' | 'missed';
    userId?: string;
    protocolId?: string;
    assignmentId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<InteractionLog[]> {
    try {
      const conditions = [];
      
      if (filter.status) {
        conditions.push(eq(interactionLogs.status, filter.status));
      }
      
      if (filter.userId) {
        conditions.push(eq(interactionLogs.userId, filter.userId));
      }
      
      if (filter.protocolId) {
        conditions.push(eq(interactionLogs.protocolId, filter.protocolId));
      }
      
      if (filter.assignmentId) {
        conditions.push(eq(interactionLogs.assignmentId, filter.assignmentId));
      }
      
      if (filter.dateFrom) {
        conditions.push(gte(interactionLogs.sentAt, filter.dateFrom));
      }
      
      if (filter.dateTo) {
        conditions.push(lte(interactionLogs.sentAt, filter.dateTo));
      }

      return await this.db
        .select()
        .from(interactionLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(interactionLogs.sentAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch interaction logs', error);
    }
  }

  async updateStatus(
    id: string, 
    status: 'sent' | 'delivered' | 'read' | 'responded' | 'missed',
    additionalData?: {
      deliveredAt?: Date;
      respondedAt?: Date;
      responseValue?: string;
      responseAction?: string;
      timeDifferenceMs?: number;
    }
  ): Promise<InteractionLog | null> {
    try {
      const updateData: any = { status };
      
      if (additionalData) {
        Object.assign(updateData, additionalData);
      }

      const [log] = await this.db
        .update(interactionLogs)
        .set(updateData)
        .where(eq(interactionLogs.id, id))
        .returning();

      return log || null;
    } catch (error) {
      throw new DatabaseError('Failed to update interaction log status', error);
    }
  }

  async markAsDelivered(id: string, deliveredAt: Date): Promise<InteractionLog | null> {
    try {
      const [log] = await this.db
        .update(interactionLogs)
        .set({ 
          status: 'delivered',
          deliveredAt,
        })
        .where(eq(interactionLogs.id, id))
        .returning();

      return log || null;
    } catch (error) {
      throw new DatabaseError('Failed to mark interaction log as delivered', error);
    }
  }

  async markAsResponded(
    id: string, 
    respondedAt: Date, 
    responseValue: string, 
    responseAction?: string
  ): Promise<InteractionLog | null> {
    try {
      // Calculate time difference in milliseconds
      const log = await this.findById(id);
      const timeDifferenceMs = log ? respondedAt.getTime() - log.sentAt.getTime() : null;

      const [updatedLog] = await this.db
        .update(interactionLogs)
        .set({ 
          status: 'responded',
          respondedAt,
          responseValue,
          responseAction,
          timeDifferenceMs,
        })
        .where(eq(interactionLogs.id, id))
        .returning();

      return updatedLog || null;
    } catch (error) {
      throw new DatabaseError('Failed to mark interaction log as responded', error);
    }
  }

  async getLogCountByStatus(status: 'sent' | 'delivered' | 'read' | 'responded' | 'missed'): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(eq(interactionLogs.status, status));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count interaction logs by status', error);
    }
  }

  async getAverageResponseTime(): Promise<number> {
    try {
      const [result] = await this.db
        .select({ 
          avgTime: avg(interactionLogs.timeDifferenceMs) 
        })
        .from(interactionLogs)
        .where(eq(interactionLogs.status, 'responded'));

      return Number(result?.avgTime) || 0;
    } catch (error) {
      throw new DatabaseError('Failed to calculate average response time', error);
    }
  }

  async getAdherenceRateByProtocol(protocolId: string): Promise<number> {
    try {
      const [totalSent] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(eq(interactionLogs.protocolId, protocolId));

      const [totalResponded] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(and(
          eq(interactionLogs.protocolId, protocolId),
          eq(interactionLogs.status, 'responded')
        ));

      const total = totalSent?.count || 0;
      const responded = totalResponded?.count || 0;

      return total > 0 ? (responded / total) * 100 : 0;
    } catch (error) {
      throw new DatabaseError('Failed to calculate adherence rate by protocol', error);
    }
  }

  async getLogsWithDetails(): Promise<Array<InteractionLog & { 
    user: { displayName: string; realName: string | null }; 
    protocol: { name: string };
    step: { stepOrder: number; messageType: string };
  }>> {
    try {
      return await this.db
        .select({
          id: interactionLogs.id,
          userId: interactionLogs.userId,
          protocolId: interactionLogs.protocolId,
          stepId: interactionLogs.stepId,
          assignmentId: interactionLogs.assignmentId,
          messageId: interactionLogs.messageId,
          sentAt: interactionLogs.sentAt,
          deliveredAt: interactionLogs.deliveredAt,
          respondedAt: interactionLogs.respondedAt,
          responseValue: interactionLogs.responseValue,
          responseAction: interactionLogs.responseAction,
          timeDifferenceMs: interactionLogs.timeDifferenceMs,
          status: interactionLogs.status,
          createdAt: interactionLogs.createdAt,
          user: {
            displayName: users.displayName,
            realName: users.realName,
          },
          protocol: {
            name: protocols.name,
          },
          step: {
            stepOrder: protocolSteps.stepOrder,
            messageType: protocolSteps.messageType,
          },
        })
        .from(interactionLogs)
        .leftJoin(users, eq(interactionLogs.userId, users.id))
        .leftJoin(protocols, eq(interactionLogs.protocolId, protocols.id))
        .leftJoin(protocolSteps, eq(interactionLogs.stepId, protocolSteps.id))
        .orderBy(desc(interactionLogs.sentAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch interaction logs with details', error);
    }
  }

  async exportResearchData(filter: {
    protocolId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<Array<{
    patientId: string;
    protocolName: string;
    stepId: string;
    stepOrder: number;
    messageSentTime: Date;
    actionTime: Date | null;
    status: string;
    timeDifferenceMs: number | null;
    responseValue: string | null;
  }>> {
    try {
      const conditions = [];
      
      if (filter.protocolId) {
        conditions.push(eq(interactionLogs.protocolId, filter.protocolId));
      }
      
      if (filter.userId) {
        conditions.push(eq(interactionLogs.userId, filter.userId));
      }
      
      if (filter.dateFrom) {
        conditions.push(gte(interactionLogs.sentAt, filter.dateFrom));
      }
      
      if (filter.dateTo) {
        conditions.push(lte(interactionLogs.sentAt, filter.dateTo));
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