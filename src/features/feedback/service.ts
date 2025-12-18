import { FeedbackDomain } from './domain.js';
import { FeedbackRepository } from './repository.js';
import { MessageBuilder, FeedbackConfigBuilder } from '../../core/line/message-builders.js';
import { lineClient } from '../../core/line/client.js';
import { database } from '../../core/database/connection.js';
import { users, protocolSteps, protocols } from '../../core/database/schema.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../../core/errors/app-error.js';
import { v4 as uuidv4 } from 'uuid';
import { FeedbackConfig } from '../../core/database/schema/protocols.js';

export interface ProtocolStepExecution {
  userId: string;
  protocolId: string;
  stepId: string;
  assignmentId: string;
}

/**
 * Service for integrating feedback system with protocol execution
 */
export class FeedbackService {
  /**
   * Execute a protocol step with feedback handling
   */
  static async executeProtocolStep(execution: ProtocolStepExecution): Promise<{
    messagesSent: number;
    requiresFeedback: boolean;
    interactionLogId?: string;
  }> {
    const { userId, protocolId, stepId, assignmentId } = execution;

    try {
      // Get user information
      const user = await database
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      if (user[0].status !== 'active') {
        throw new AppError('User is not active', 400, 'USER_INACTIVE');
      }

      // Get protocol step information
      const step = await database
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.id, stepId))
        .limit(1);

      if (step.length === 0) {
        throw new AppError('Protocol step not found', 404, 'STEP_NOT_FOUND');
      }

      const stepData = step[0];
      const lineUserId = user[0].lineUserId;
      const sentAt = new Date();

      // Build and send the main content message
      const contentMessage = MessageBuilder.buildFromContent(
        stepData.messageType,
        stepData.contentPayload
      );

      await lineClient.getClient().pushMessage(lineUserId, contentMessage);
      let messagesSent = 1;
      let interactionLogId: string | undefined;

      // Handle feedback if required
      if (stepData.requiresAction && stepData.feedbackConfig) {
        const feedbackConfig = stepData.feedbackConfig as FeedbackConfig;
        
        // Send feedback message
        const feedbackMessage = MessageBuilder.buildFeedbackMessage({
          question: feedbackConfig.question,
          buttons: feedbackConfig.buttons,
          protocolId,
          stepId,
        });

        await lineClient.getClient().pushMessage(lineUserId, feedbackMessage);
        messagesSent++;

        // Create interaction log for tracking
        interactionLogId = await FeedbackRepository.createInteractionLog({
          userId,
          protocolId,
          stepId,
          assignmentId,
          sentAt,
          status: 'sent',
        });

        return {
          messagesSent,
          requiresFeedback: true,
          interactionLogId,
        };
      }

      return {
        messagesSent,
        requiresFeedback: false,
      };
    } catch (error) {
      console.error('Error executing protocol step:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to execute protocol step',
        500,
        'STEP_EXECUTION_ERROR'
      );
    }
  }

  /**
   * Send a standalone feedback message (not part of protocol execution)
   */
  static async sendStandaloneFeedbackMessage(
    userId: string,
    messageText: string,
    feedbackOptions: {
      question?: string;
      buttons?: Array<{
        label: string;
        value: string;
        action: 'complete' | 'postpone' | 'skip';
      }>;
    }
  ): Promise<{ messagesSent: number; interactionLogId: string }> {
    try {
      // Get user information
      const user = await database
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const lineUserId = user[0].lineUserId;
      const sentAt = new Date();

      // Send main message
      await lineClient.sendTextMessage(lineUserId, messageText);

      // Create feedback configuration
      const feedbackConfig: FeedbackConfig = (feedbackOptions.buttons && feedbackOptions.question)
        ? FeedbackConfigBuilder.createCustomFeedback(
            feedbackOptions.question,
            feedbackOptions.buttons
          )
        : FeedbackConfigBuilder.createMedicationFeedback(); // Default

      // Generate temporary IDs for standalone message
      const tempProtocolId = uuidv4();
      const tempStepId = uuidv4();
      const tempAssignmentId = uuidv4();

      // Send feedback message
      const feedbackMessage = MessageBuilder.buildFeedbackMessage({
        question: feedbackConfig.question,
        buttons: feedbackConfig.buttons,
        protocolId: tempProtocolId,
        stepId: tempStepId,
      });

      await lineClient.getClient().pushMessage(lineUserId, feedbackMessage);

      // Create interaction log
      const interactionLogId = await FeedbackRepository.createInteractionLog({
        userId,
        protocolId: tempProtocolId,
        stepId: tempStepId,
        assignmentId: tempAssignmentId,
        sentAt,
        status: 'sent',
      });

      return {
        messagesSent: 2,
        interactionLogId,
      };
    } catch (error) {
      console.error('Error sending standalone feedback message:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to send standalone feedback message',
        500,
        'STANDALONE_MESSAGE_ERROR'
      );
    }
  }

  /**
   * Get comprehensive feedback analytics for a protocol
   */
  static async getProtocolFeedbackAnalytics(protocolId: string) {
    try {
      // Get protocol information
      const protocol = await database
        .select()
        .from(protocols)
        .where(eq(protocols.id, protocolId))
        .limit(1);

      if (protocol.length === 0) {
        throw new AppError('Protocol not found', 404, 'PROTOCOL_NOT_FOUND');
      }

      // Get all steps for this protocol
      const steps = await database
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      // Get overall protocol metrics
      const overallMetrics = await FeedbackRepository.getFeedbackMetrics(protocolId);

      // Get metrics for each step that requires feedback
      const stepMetrics = await Promise.all(
        steps
          .filter(step => step.requiresAction)
          .map(async (step) => {
            const metrics = await FeedbackRepository.getFeedbackMetrics(protocolId, step.id);
            return {
              stepId: step.id,
              stepOrder: step.stepOrder,
              messageType: step.messageType,
              ...metrics,
            };
          })
      );

      // Get recent responses
      const recentResponses = await FeedbackRepository.getRecentFeedbackResponses(10, protocolId);

      // Get pending messages
      const pendingMessages = await FeedbackRepository.getPendingFeedbackMessages();
      const protocolPending = pendingMessages.filter(msg => 
        steps.some(step => step.id === msg.id)
      );

      return {
        protocol: {
          id: protocol[0].id,
          name: protocol[0].name,
          status: protocol[0].status,
        },
        overall: overallMetrics,
        steps: stepMetrics,
        recentResponses,
        pendingMessages: protocolPending,
        summary: {
          totalSteps: steps.length,
          feedbackSteps: steps.filter(s => s.requiresAction).length,
          averageResponseRate: stepMetrics.length > 0 
            ? Math.round(stepMetrics.reduce((sum, s) => sum + s.responseRate, 0) / stepMetrics.length)
            : 0,
        },
      };
    } catch (error) {
      console.error('Error getting protocol feedback analytics:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to get protocol feedback analytics',
        500,
        'ANALYTICS_ERROR'
      );
    }
  }

  /**
   * Clean up old interaction logs and mark missed messages
   */
  static async performMaintenanceTasks(options: {
    markMissedAfterHours?: number;
    deleteLogsOlderThanDays?: number;
  } = {}): Promise<{
    markedMissed: number;
    deletedLogs: number;
  }> {
    try {
      const { markMissedAfterHours = 24, deleteLogsOlderThanDays = 90 } = options;

      // Mark old messages as missed
      const markedMissed = await FeedbackRepository.markMissedMessages(markMissedAfterHours);

      // Note: Implement log deletion if needed (be careful with data retention requirements)
      const deletedLogs = 0; // Placeholder for now

      return {
        markedMissed,
        deletedLogs,
      };
    } catch (error) {
      console.error('Error performing maintenance tasks:', error);
      throw new AppError(
        'Failed to perform maintenance tasks',
        500,
        'MAINTENANCE_ERROR'
      );
    }
  }
}