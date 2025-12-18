import { lineClient } from '../line/client.js';
import { MessageBuilder, FeedbackMessageOptions } from '../line/message-builders.js';
import { database } from '../database/connection.js';
import { interactionLogs } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors/app-error.js';
import { v4 as uuidv4 } from 'uuid';

export interface MessageDeliveryOptions {
  userId: string;
  protocolId: string;
  stepId: string;
  assignmentId: string;
  messageType: 'text' | 'image' | 'flex' | 'template';
  content: {
    text?: string;
    imageUrl?: string;
    previewImageUrl?: string;
    flexContent?: any;
    templateContent?: any;
  };
  requiresFeedback: boolean;
  feedbackConfig?: {
    question: string;
    buttons: Array<{
      label: string;
      value: string;
      action: 'complete' | 'postpone' | 'skip';
    }>;
  };
  retryAttempt?: number;
  maxRetries?: number;
}

export interface DeliveryResult {
  success: boolean;
  logId: string;
  messageId?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Comprehensive message delivery service with enhanced error handling and monitoring
 */
export class MessageDeliveryService {
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

  /**
   * Deliver a message with comprehensive error handling and logging
   */
  static async deliverMessage(options: MessageDeliveryOptions): Promise<DeliveryResult> {
    const {
      userId,
      protocolId,
      stepId,
      assignmentId,
      messageType,
      content,
      requiresFeedback,
      feedbackConfig,
      retryAttempt = 0,
      maxRetries = this.DEFAULT_MAX_RETRIES,
    } = options;

    const logId = uuidv4();
    const sentAt = new Date();

    try {
      // Create interaction log entry
      await database.insert(interactionLogs).values({
        id: logId,
        userId,
        protocolId,
        stepId,
        assignmentId,
        sentAt,
        status: 'sent',
        createdAt: new Date(),
      });

      // Deliver the message based on type
      let messageId: string | undefined;
      
      switch (messageType) {
        case 'text':
          messageId = await this.sendTextMessage(userId, content.text!);
          break;
          
        case 'image':
          messageId = await this.sendImageMessage(
            userId,
            content.imageUrl!,
            content.previewImageUrl
          );
          break;
          
        case 'flex':
          messageId = await this.sendFlexMessage(
            userId,
            content.text || 'Flex Message',
            content.flexContent
          );
          break;
          
        case 'template':
          if (requiresFeedback && feedbackConfig) {
            messageId = await this.sendFeedbackMessage(userId, {
              question: feedbackConfig.question,
              buttons: feedbackConfig.buttons,
              protocolId,
              stepId,
            });
          } else {
            throw new AppError(
              'Template message requires feedback configuration',
              400,
              'INVALID_TEMPLATE_CONFIG'
            );
          }
          break;
          
        default:
          throw new AppError(
            `Unsupported message type: ${messageType}`,
            400,
            'UNSUPPORTED_MESSAGE_TYPE'
          );
      }

      // Update log as delivered
      await database
        .update(interactionLogs)
        .set({
          messageId,
          deliveredAt: new Date(),
          status: 'delivered',
        })
        .where(eq(interactionLogs.id, logId));

      console.log(`✅ Message delivered successfully to user ${userId} (logId: ${logId})`);
      
      return {
        success: true,
        logId,
        messageId,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRetryable = this.isRetryableError(error);
      
      console.error(`❌ Failed to deliver message to user ${userId}:`, errorMessage);

      // Update log with error status
      await database
        .update(interactionLogs)
        .set({
          status: 'failed',
        })
        .where(eq(interactionLogs.id, logId));

      // Determine if we should retry
      const shouldRetry = isRetryable && retryAttempt < maxRetries;

      return {
        success: false,
        logId,
        error: errorMessage,
        retryable: shouldRetry,
      };
    }
  }

  /**
   * Send a text message with enhanced error handling
   */
  private static async sendTextMessage(userId: string, text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new AppError(
        'Text message content cannot be empty',
        400,
        'EMPTY_MESSAGE_CONTENT'
      );
    }

    try {
      const message = MessageBuilder.buildTextMessage(text);
      await lineClient.getClient().pushMessage(userId, message);
      return `text_${Date.now()}`;
    } catch (error) {
      throw new AppError(
        `Failed to send text message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send an image message with validation
   */
  private static async sendImageMessage(
    userId: string,
    imageUrl: string,
    previewImageUrl?: string
  ): Promise<string> {
    if (!imageUrl) {
      throw new AppError(
        'Image URL is required',
        400,
        'MISSING_IMAGE_URL'
      );
    }

    try {
      const message = MessageBuilder.buildImageMessage(imageUrl, previewImageUrl);
      await lineClient.getClient().pushMessage(userId, message);
      return `image_${Date.now()}`;
    } catch (error) {
      throw new AppError(
        `Failed to send image message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send a flex message with validation
   */
  private static async sendFlexMessage(
    userId: string,
    altText: string,
    flexContent: any
  ): Promise<string> {
    if (!flexContent) {
      throw new AppError(
        'Flex content is required',
        400,
        'MISSING_FLEX_CONTENT'
      );
    }

    try {
      const message = MessageBuilder.buildFlexMessage(altText, flexContent);
      await lineClient.getClient().pushMessage(userId, message);
      return `flex_${Date.now()}`;
    } catch (error) {
      throw new AppError(
        `Failed to send flex message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Send a feedback message with button template
   */
  private static async sendFeedbackMessage(
    userId: string,
    options: FeedbackMessageOptions
  ): Promise<string> {
    try {
      const message = MessageBuilder.buildFeedbackMessage(options);
      await lineClient.getClient().pushMessage(userId, message);
      return `feedback_${Date.now()}`;
    } catch (error) {
      throw new AppError(
        `Failed to send feedback message: ${error}`,
        500,
        'LINE_API_ERROR'
      );
    }
  }

  /**
   * Determine if an error is retryable
   */
  private static isRetryableError(error: any): boolean {
    // LINE API rate limiting
    if (error?.response?.status === 429) {
      return true;
    }

    // Temporary server errors
    if (error?.response?.status >= 500 && error?.response?.status < 600) {
      return true;
    }

    // Network errors
    if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
      return true;
    }

    // LINE API temporary errors
    if (error?.message?.includes('temporarily unavailable')) {
      return true;
    }

    return false;
  }

  /**
   * Get delivery statistics for monitoring
   */
  static async getDeliveryStats(timeRange?: { from: Date; to: Date }) {
    const whereClause = timeRange
      ? `WHERE sent_at >= '${timeRange.from.toISOString()}' AND sent_at <= '${timeRange.to.toISOString()}'`
      : '';

    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at)) * 1000) as avg_delivery_time_ms
      FROM interaction_logs 
      ${whereClause}
      GROUP BY status
    `;

    try {
      const result = await database.execute(query);
      return result.rows;
    } catch (error) {
      console.error('Failed to get delivery stats:', error);
      return [];
    }
  }

  /**
   * Get failed deliveries for retry processing
   */
  static async getFailedDeliveries(limit: number = 100) {
    return await database
      .select()
      .from(interactionLogs)
      .where(eq(interactionLogs.status, 'failed'))
      .limit(limit);
  }

  /**
   * Mark a delivery as successful (for webhook confirmations)
   */
  static async markDeliveryConfirmed(logId: string, messageId?: string): Promise<void> {
    await database
      .update(interactionLogs)
      .set({
        messageId,
        status: 'delivered',
        deliveredAt: new Date(),
      })
      .where(eq(interactionLogs.id, logId));
  }

  /**
   * Mark a delivery as read (for read receipts)
   */
  static async markDeliveryRead(logId: string): Promise<void> {
    await database
      .update(interactionLogs)
      .set({
        status: 'read',
      })
      .where(eq(interactionLogs.id, logId));
  }
}