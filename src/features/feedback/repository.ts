import { database } from '../../core/database/connection.js';
import { 
  interactionLogs, 
  users, 
  protocols, 
  protocolSteps,
  protocolAssignments 
} from '../../core/database/schema.js';
import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';
import { AppError } from '../../core/errors/app-error.js';

export interface FeedbackInteractionLog {
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

export interface FeedbackMetrics {
  protocolId: string;
  stepId?: string;
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  averageResponseTimeMs: number;
  actionBreakdown: Record<string, number>;
}

export class FeedbackRepository {
  /**
   * Create a new interaction log entry
   */
  static async createInteractionLog(data: {
    userId: string;
    protocolId: string;
    stepId: string;
    assignmentId: string;
    messageId?: string;
    sentAt: Date;
    status?: 'sent' | 'delivered' | 'read' | 'responded' | 'missed';
  }): Promise<string> {
    try {
      const result = await database
        .insert(interactionLogs)
        .values({
          ...data,
          status: data.status || 'sent',
          createdAt: new Date(),
        })
        .returning({ id: interactionLogs.id });

      return result[0].id;
    } catch (error) {
      console.error('Error creating interaction log:', error);
      throw new AppError(
        'Failed to create interaction log',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Update interaction log with response data
   */
  static async updateInteractionLogResponse(
    logId: string,
    data: {
      respondedAt: Date;
      responseValue: string;
      responseAction: string;
      timeDifferenceMs: number;
      status: 'responded';
    }
  ): Promise<void> {
    try {
      await database
        .update(interactionLogs)
        .set(data)
        .where(eq(interactionLogs.id, logId));
    } catch (error) {
      console.error('Error updating interaction log:', error);
      throw new AppError(
        'Failed to update interaction log',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Get interaction logs for a user and protocol
   */
  static async getInteractionLogs(
    userId: string,
    protocolId?: string,
    limit: number = 50
  ): Promise<FeedbackInteractionLog[]> {
    try {
      const whereConditions = protocolId
        ? and(
            eq(interactionLogs.userId, userId),
            eq(interactionLogs.protocolId, protocolId)
          )
        : eq(interactionLogs.userId, userId);

      return await database
        .select()
        .from(interactionLogs)
        .where(whereConditions)
        .orderBy(desc(interactionLogs.sentAt))
        .limit(limit);
    } catch (error) {
      console.error('Error getting interaction logs:', error);
      throw new AppError(
        'Failed to get interaction logs',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Get feedback metrics for a protocol or specific step
   */
  static async getFeedbackMetrics(
    protocolId: string,
    stepId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<FeedbackMetrics> {
    try {
      // Build where conditions
      const conditions = [eq(interactionLogs.protocolId, protocolId)];
      
      if (stepId) {
        conditions.push(eq(interactionLogs.stepId, stepId));
      }
      
      if (dateFrom) {
        conditions.push(gte(interactionLogs.sentAt, dateFrom));
      }
      
      if (dateTo) {
        conditions.push(lte(interactionLogs.sentAt, dateTo));
      }

      const logs = await database
        .select({
          responseAction: interactionLogs.responseAction,
          responseValue: interactionLogs.responseValue,
          timeDifferenceMs: interactionLogs.timeDifferenceMs,
          status: interactionLogs.status,
          sentAt: interactionLogs.sentAt,
          respondedAt: interactionLogs.respondedAt,
        })
        .from(interactionLogs)
        .where(and(...conditions));

      // Calculate metrics
      const totalSent = logs.length;
      const respondedLogs = logs.filter(log => log.status === 'responded');
      const totalResponded = respondedLogs.length;
      const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;

      // Calculate average response time
      const validResponseTimes = respondedLogs
        .filter(log => log.timeDifferenceMs !== null)
        .map(log => log.timeDifferenceMs!);
      
      const averageResponseTimeMs = validResponseTimes.length > 0
        ? Math.round(validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length)
        : 0;

      // Calculate action breakdown
      const actionBreakdown: Record<string, number> = {};
      respondedLogs.forEach(log => {
        if (log.responseAction) {
          actionBreakdown[log.responseAction] = (actionBreakdown[log.responseAction] || 0) + 1;
        }
      });

      return {
        protocolId,
        stepId,
        totalSent,
        totalResponded,
        responseRate,
        averageResponseTimeMs,
        actionBreakdown,
      };
    } catch (error) {
      console.error('Error getting feedback metrics:', error);
      throw new AppError(
        'Failed to get feedback metrics',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Get recent feedback responses for monitoring
   */
  static async getRecentFeedbackResponses(
    limit: number = 20,
    protocolId?: string
  ): Promise<Array<{
    id: string;
    userId: string;
    userName: string;
    protocolName: string;
    stepOrder: string;
    responseAction: string;
    responseValue: string;
    respondedAt: Date;
    timeDifferenceMs: number;
  }>> {
    try {
      const whereConditions = protocolId
        ? and(
            eq(interactionLogs.status, 'responded'),
            eq(interactionLogs.protocolId, protocolId)
          )
        : eq(interactionLogs.status, 'responded');

      const recentResults = await database
        .select({
          id: interactionLogs.id,
          userId: interactionLogs.userId,
          userName: users.displayName,
          protocolName: protocols.name,
          stepOrder: protocolSteps.stepOrder,
          responseAction: interactionLogs.responseAction,
          responseValue: interactionLogs.responseValue,
          respondedAt: interactionLogs.respondedAt,
          timeDifferenceMs: interactionLogs.timeDifferenceMs,
        })
        .from(interactionLogs)
        .innerJoin(users, eq(interactionLogs.userId, users.id))
        .innerJoin(protocols, eq(interactionLogs.protocolId, protocols.id))
        .innerJoin(protocolSteps, eq(interactionLogs.stepId, protocolSteps.id))
        .where(whereConditions)
        .orderBy(desc(interactionLogs.respondedAt))
        .limit(limit);

      
      return recentResults.filter(result => 
        result.respondedAt !== null && 
        result.responseAction !== null && 
        result.responseValue !== null &&
        result.timeDifferenceMs !== null
      ).map(result => ({
        ...result,
        respondedAt: result.respondedAt!,
        responseAction: result.responseAction!,
        responseValue: result.responseValue!,
        timeDifferenceMs: result.timeDifferenceMs!,
      }));
    } catch (error) {
      console.error('Error getting recent feedback responses:', error);
      throw new AppError(
        'Failed to get recent feedback responses',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Get pending feedback messages (sent but not responded)
   */
  static async getPendingFeedbackMessages(
    userId?: string,
    olderThanHours?: number
  ): Promise<Array<{
    id: string;
    userId: string;
    userName: string;
    protocolName: string;
    stepOrder: string;
    sentAt: Date;
    hoursAgo: number;
  }>> {
    try {
      const whereConditions = userId
        ? and(
            eq(interactionLogs.status, 'sent'),
            isNull(interactionLogs.respondedAt),
            eq(interactionLogs.userId, userId)
          )
        : and(
            eq(interactionLogs.status, 'sent'),
            isNull(interactionLogs.respondedAt)
          );

      const results = await database
        .select({
          id: interactionLogs.id,
          userId: interactionLogs.userId,
          userName: users.displayName,
          protocolName: protocols.name,
          stepOrder: protocolSteps.stepOrder,
          sentAt: interactionLogs.sentAt,
        })
        .from(interactionLogs)
        .innerJoin(users, eq(interactionLogs.userId, users.id))
        .innerJoin(protocols, eq(interactionLogs.protocolId, protocols.id))
        .innerJoin(protocolSteps, eq(interactionLogs.stepId, protocolSteps.id))
        .where(whereConditions)
        .orderBy(desc(interactionLogs.sentAt));
      const now = new Date();

      return results
        .map(result => ({
          ...result,
          hoursAgo: Math.round((now.getTime() - result.sentAt.getTime()) / (1000 * 60 * 60)),
        }))
        .filter(result => !olderThanHours || result.hoursAgo >= olderThanHours);
    } catch (error) {
      console.error('Error getting pending feedback messages:', error);
      throw new AppError(
        'Failed to get pending feedback messages',
        500,
        'DATABASE_ERROR'
      );
    }
  }

  /**
   * Mark messages as missed if no response after specified time
   */
  static async markMissedMessages(hoursThreshold: number = 24): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - (hoursThreshold * 60 * 60 * 1000));
      
      const result = await database
        .update(interactionLogs)
        .set({
          status: 'missed',
        })
        .where(and(
          eq(interactionLogs.status, 'sent'),
          isNull(interactionLogs.respondedAt),
          lte(interactionLogs.sentAt, cutoffTime)
        ));

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error marking missed messages:', error);
      throw new AppError(
        'Failed to mark missed messages',
        500,
        'DATABASE_ERROR'
      );
    }
  }
}