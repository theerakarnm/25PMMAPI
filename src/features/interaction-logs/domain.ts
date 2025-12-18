import { InteractionLogRepository } from './repository.js';
import { ProtocolAssignmentRepository } from '../protocol-assignments/repository.js';
import { 
  type InteractionLog,
  insertInteractionLogSchema
} from '../../core/database/schema/interaction-logs.js';
import { NotFoundError } from '../../core/errors/app-error.js';

export class InteractionLogService {
  private logRepo = new InteractionLogRepository();
  private assignmentRepo = new ProtocolAssignmentRepository();

  async createLog(data: {
    userId: string;
    protocolId: string;
    stepId: string;
    assignmentId: string;
    messageId?: string;
    sentAt: Date;
    status?: 'sent' | 'delivered' | 'read' | 'responded' | 'missed';
  }): Promise<InteractionLog> {
    const validatedData = insertInteractionLogSchema.parse(data);
    return await this.logRepo.create(validatedData);
  }

  async getLogById(id: string): Promise<InteractionLog> {
    const log = await this.logRepo.findById(id);
    if (!log) {
      throw new NotFoundError('Interaction log not found');
    }
    return log;
  }

  async getLogByMessageId(messageId: string): Promise<InteractionLog | null> {
    return await this.logRepo.findByMessageId(messageId);
  }

  async getUserLogs(userId: string, limit?: number): Promise<InteractionLog[]> {
    return await this.logRepo.findByUserId(userId, limit);
  }

  async getProtocolLogs(protocolId: string, limit?: number): Promise<InteractionLog[]> {
    return await this.logRepo.findByProtocolId(protocolId, limit);
  }

  async getAssignmentLogs(assignmentId: string): Promise<InteractionLog[]> {
    return await this.logRepo.findByAssignmentId(assignmentId);
  }

  async getLogs(filter?: {
    status?: 'sent' | 'delivered' | 'read' | 'responded' | 'missed';
    userId?: string;
    protocolId?: string;
    assignmentId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<InteractionLog[]> {
    return await this.logRepo.findAll(filter);
  }

  async markAsDelivered(id: string, deliveredAt?: Date): Promise<InteractionLog> {
    const log = await this.logRepo.markAsDelivered(id, deliveredAt || new Date());
    if (!log) {
      throw new NotFoundError('Interaction log not found');
    }
    return log;
  }

  async markAsResponded(
    id: string, 
    responseValue: string, 
    responseAction?: string,
    respondedAt?: Date
  ): Promise<InteractionLog> {
    const log = await this.logRepo.markAsResponded(
      id, 
      respondedAt || new Date(), 
      responseValue, 
      responseAction
    );
    
    if (!log) {
      throw new NotFoundError('Interaction log not found');
    }

    // Update protocol assignment progress
    await this.updateAssignmentProgress(log.assignmentId);

    return log;
  }

  async markAsMissed(id: string): Promise<InteractionLog> {
    const log = await this.logRepo.updateStatus(id, 'missed');
    if (!log) {
      throw new NotFoundError('Interaction log not found');
    }
    return log;
  }

  private async updateAssignmentProgress(assignmentId: string): Promise<void> {
    try {
      // Get all logs for this assignment
      const logs = await this.logRepo.findByAssignmentId(assignmentId);
      
      // Calculate completed steps (responded logs)
      const completedSteps = logs.filter(log => log.status === 'responded').length;
      
      // Get assignment to update
      const assignment = await this.assignmentRepo.findById(assignmentId);
      if (!assignment) return;

      // Calculate current step (highest step order that has been sent)
      const currentStep = logs.length;
      
      // Calculate adherence rate
      const adherenceRate = logs.length > 0 
        ? ((completedSteps / logs.length) * 100).toFixed(2)
        : '0.00';

      // Update assignment progress
      await this.assignmentRepo.updateProgress(
        assignmentId, 
        currentStep, 
        completedSteps, 
        adherenceRate
      );
    } catch (error) {
      // Log error but don't throw - this is a background update
      console.error('Failed to update assignment progress:', error);
    }
  }

  async getLogStats(): Promise<{
    total: number;
    sent: number;
    delivered: number;
    responded: number;
    missed: number;
    averageResponseTime: number;
  }> {
    const [sent, delivered, responded, missed, averageResponseTime] = await Promise.all([
      this.logRepo.getLogCountByStatus('sent'),
      this.logRepo.getLogCountByStatus('delivered'),
      this.logRepo.getLogCountByStatus('responded'),
      this.logRepo.getLogCountByStatus('missed'),
      this.logRepo.getAverageResponseTime(),
    ]);

    return {
      total: sent + delivered + responded + missed,
      sent,
      delivered,
      responded,
      missed,
      averageResponseTime,
    };
  }

  async getAdherenceRateByProtocol(protocolId: string): Promise<number> {
    return await this.logRepo.getAdherenceRateByProtocol(protocolId);
  }

  async getLogsWithDetails(): Promise<Array<InteractionLog & { 
    user: { displayName: string; realName: string | null }; 
    protocol: { name: string };
    step: { stepOrder: number; messageType: string };
  }>> {
    return await this.logRepo.getLogsWithDetails();
  }

  async exportResearchData(filter?: {
    protocolId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Array<{
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
    return await this.logRepo.exportResearchData(filter);
  }

  async getProtocolAdherenceMetrics(protocolId: string): Promise<{
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
  }> {
    const logs = await this.logRepo.findByProtocolId(protocolId);
    
    const totalMessages = logs.length;
    const respondedMessages = logs.filter(log => log.status === 'responded').length;
    const adherenceRate = totalMessages > 0 ? (respondedMessages / totalMessages) * 100 : 0;
    
    // Calculate average response time for responded messages
    const respondedLogs = logs.filter(log => log.status === 'responded' && log.timeDifferenceMs);
    const averageResponseTime = respondedLogs.length > 0 
      ? respondedLogs.reduce((sum, log) => sum + (log.timeDifferenceMs || 0), 0) / respondedLogs.length
      : 0;

    // Group by step order for step metrics
    const stepGroups = logs.reduce((groups, log) => {
      // We need to get step order from the step details
      // For now, we'll use a placeholder - this would need to be joined with protocol steps
      const stepOrder = 1; // This should come from joining with protocol_steps table
      
      if (!groups[stepOrder]) {
        groups[stepOrder] = [];
      }
      groups[stepOrder].push(log);
      return groups;
    }, {} as Record<number, InteractionLog[]>);

    const stepMetrics = Object.entries(stepGroups).map(([stepOrder, stepLogs]) => {
      const sentCount = stepLogs.length;
      const responseCount = stepLogs.filter(log => log.status === 'responded').length;
      const stepAdherenceRate = sentCount > 0 ? (responseCount / sentCount) * 100 : 0;
      
      const stepRespondedLogs = stepLogs.filter(log => log.status === 'responded' && log.timeDifferenceMs);
      const stepAverageResponseTime = stepRespondedLogs.length > 0 
        ? stepRespondedLogs.reduce((sum, log) => sum + (log.timeDifferenceMs || 0), 0) / stepRespondedLogs.length
        : 0;

      return {
        stepOrder: parseInt(stepOrder),
        sentCount,
        responseCount,
        adherenceRate: stepAdherenceRate,
        averageResponseTime: stepAverageResponseTime,
      };
    });

    return {
      totalMessages,
      respondedMessages,
      adherenceRate,
      averageResponseTime,
      stepMetrics,
    };
  }
}