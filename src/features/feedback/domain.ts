import { database } from '../../core/database/connection.js';
import { users, interactionLogs, protocolSteps, protocols } from '../../core/database/schema.js';
import { eq, and } from 'drizzle-orm';
import { lineClient } from '../../core/line/client.js';
import { MessageBuilder, ConfirmationMessageBuilder } from '../../core/line/message-builders.js';
import { AppError } from '../../core/errors/app-error.js';
import { v4 as uuidv4 } from 'uuid';
import {
  SendFeedbackMessageRequest,
  ProcessFeedbackResponseRequest,
  FeedbackMessageResponse,
  FeedbackProcessingResponse,
  FeedbackValidationResponse,
} from './interface.js';
import { FeedbackConfig } from '../../core/database/schema/protocols.js';

export class FeedbackDomain {
  /**
   * Send a message with feedback buttons to a user
   */
  static async sendFeedbackMessage(
    request: SendFeedbackMessageRequest
  ): Promise<FeedbackMessageResponse> {
    const { userId, protocolId, stepId, messageContent, feedbackConfig } = request;

    try {
      // Get user LINE ID
      const user = await database
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        throw new AppError(
          'User not found',
          404,
          'USER_NOT_FOUND'
        );
      }

      if (user[0].status !== 'active') {
        throw new AppError(
          'User is not active',
          400,
          'USER_INACTIVE'
        );
      }

      const lineUserId = user[0].lineUserId;
      const sentAt = new Date();

      // Build and send the main content message
      const contentMessage = MessageBuilder.buildFromContent(
        messageContent.type,
        messageContent.payload
      );

      await lineClient.getClient().pushMessage(lineUserId, contentMessage);

      // Build and send the feedback message
      const feedbackMessage = MessageBuilder.buildFeedbackMessage({
        question: feedbackConfig.question,
        buttons: feedbackConfig.buttons,
        protocolId,
        stepId,
      });

      const response = await lineClient.getClient().pushMessage(lineUserId, feedbackMessage);
      
      // Extract message ID from response if available (LINE API doesn't always provide this)
      const messageId = undefined; // LINE API response structure varies

      return {
        messageId,
        sentAt,
        requiresResponse: true,
        feedbackConfig,
      };
    } catch (error) {
      console.error('Error sending feedback message:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to send feedback message',
        500,
        'FEEDBACK_SEND_ERROR'
      );
    }
  }

  /**
   * Process a feedback response from a user
   */
  static async processFeedbackResponse(
    request: ProcessFeedbackResponseRequest
  ): Promise<FeedbackProcessingResponse> {
    const {
      userId,
      protocolId,
      stepId,
      assignmentId,
      responseValue,
      responseAction,
      originalSentAt,
    } = request;

    try {
      const respondedAt = new Date();
      const timeDifferenceMs = respondedAt.getTime() - originalSentAt.getTime();

      // Create interaction log
      const interactionLogId = uuidv4();
      await database.insert(interactionLogs).values({
        id: interactionLogId,
        userId,
        protocolId,
        stepId,
        assignmentId,
        sentAt: originalSentAt,
        respondedAt,
        responseValue,
        responseAction,
        timeDifferenceMs,
        status: 'responded',
        createdAt: new Date(),
      });

      // Get protocol and step information for contextual confirmation
      const [protocolInfo, stepInfo] = await Promise.all([
        database
          .select({ name: protocols.name })
          .from(protocols)
          .where(eq(protocols.id, protocolId))
          .limit(1),
        database
          .select({ contentPayload: protocolSteps.contentPayload })
          .from(protocolSteps)
          .where(eq(protocolSteps.id, stepId))
          .limit(1),
      ]);

      const protocolName = protocolInfo[0]?.name;
      const payload = stepInfo[0]?.contentPayload as any;
      const stepDescription = payload?.description || 
                             payload?.text?.substring(0, 50) || 
                             'Protocol step';

      // Generate and send confirmation message
      const confirmationMessage = ConfirmationMessageBuilder.buildContextualConfirmation(
        responseAction,
        protocolName,
        stepDescription
      );

      // Get user LINE ID for sending confirmation
      const user = await database
        .select({ lineUserId: users.lineUserId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        throw new AppError(
          'User not found for confirmation',
          404,
          'USER_NOT_FOUND'
        );
      }

      let confirmationSent = false;
      try {
        await lineClient.sendTextMessage(user[0].lineUserId, confirmationMessage);
        confirmationSent = true;
      } catch (confirmationError) {
        console.error('Failed to send confirmation message:', confirmationError);
        // Don't throw error here, as the main response was processed successfully
      }

      return {
        interactionLogId,
        confirmationSent,
        confirmationMessage,
        timeDifferenceMs,
        status: 'responded',
      };
    } catch (error) {
      console.error('Error processing feedback response:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to process feedback response',
        500,
        'FEEDBACK_PROCESSING_ERROR'
      );
    }
  }

  /**
   * Validate feedback configuration
   */
  static validateFeedbackConfig(feedbackConfig: FeedbackConfig): FeedbackValidationResponse {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Validate question
    if (!feedbackConfig.question || feedbackConfig.question.trim().length === 0) {
      errors.push('Feedback question is required');
    } else if (feedbackConfig.question.length > 160) {
      errors.push('Feedback question should be 160 characters or less for better display');
    }

    // Validate buttons
    if (!feedbackConfig.buttons || feedbackConfig.buttons.length === 0) {
      errors.push('At least one feedback button is required');
    } else if (feedbackConfig.buttons.length > 4) {
      errors.push('Maximum 4 feedback buttons are allowed');
    } else {
      // Validate individual buttons
      feedbackConfig.buttons.forEach((button, index) => {
        if (!button.label || button.label.trim().length === 0) {
          errors.push(`Button ${index + 1}: Label is required`);
        } else if (button.label.length > 20) {
          errors.push(`Button ${index + 1}: Label should be 20 characters or less`);
        }

        if (!button.value || button.value.trim().length === 0) {
          errors.push(`Button ${index + 1}: Value is required`);
        }

        if (!['complete', 'postpone', 'skip'].includes(button.action)) {
          errors.push(`Button ${index + 1}: Action must be 'complete', 'postpone', or 'skip'`);
        }
      });

      // Check for duplicate values
      const values = feedbackConfig.buttons.map(b => b.value);
      const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate button values found: ${duplicates.join(', ')}`);
      }
    }

    // Provide suggestions for improvement
    if (feedbackConfig.buttons && feedbackConfig.buttons.length === 1) {
      suggestions.push('Consider adding a second option like "ยังไม่ทำ" for better user experience');
    }

    if (feedbackConfig.question && !feedbackConfig.question.includes('?') && !feedbackConfig.question.includes('หรือ')) {
      suggestions.push('Consider phrasing the question more clearly with "หรือยัง?" or similar');
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Get feedback statistics for a protocol step
   */
  static async getFeedbackStatistics(protocolId: string, stepId?: string) {
    try {
      const whereConditions = stepId 
        ? and(
            eq(interactionLogs.protocolId, protocolId),
            eq(interactionLogs.stepId, stepId)
          )
        : eq(interactionLogs.protocolId, protocolId);

      const responses = await database
        .select({
          responseAction: interactionLogs.responseAction,
          responseValue: interactionLogs.responseValue,
          timeDifferenceMs: interactionLogs.timeDifferenceMs,
          respondedAt: interactionLogs.respondedAt,
        })
        .from(interactionLogs)
        .where(whereConditions);



      const statistics = {
        totalResponses: responses.length,
        responseBreakdown: {} as Record<string, number>,
        averageResponseTimeMs: 0,
        completionRate: 0,
      };

      if (responses.length > 0) {
        // Calculate response breakdown
        responses.forEach(response => {
          const action = response.responseAction || 'unknown';
          statistics.responseBreakdown[action] = (statistics.responseBreakdown[action] || 0) + 1;
        });

        // Calculate average response time
        const validResponseTimes = responses
          .filter(r => r.timeDifferenceMs !== null)
          .map(r => r.timeDifferenceMs!);
        
        if (validResponseTimes.length > 0) {
          statistics.averageResponseTimeMs = Math.round(
            validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length
          );
        }

        // Calculate completion rate (complete actions / total responses)
        const completeResponses = statistics.responseBreakdown['complete'] || 0;
        statistics.completionRate = Math.round((completeResponses / responses.length) * 100);
      }

      return statistics;
    } catch (error) {
      console.error('Error getting feedback statistics:', error);
      throw new AppError(
        'Failed to get feedback statistics',
        500,
        'STATISTICS_ERROR'
      );
    }
  }
}