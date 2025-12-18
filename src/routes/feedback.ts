import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FeedbackDomain } from '../features/feedback/domain.js';
import { FeedbackRepository } from '../features/feedback/repository.js';
import { 
  sendFeedbackMessageRequestSchema,
  processFeedbackResponseRequestSchema,
  validateFeedbackConfigRequestSchema 
} from '../features/feedback/interface.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { AppError } from '../core/errors/app-error.js';
import { authMiddleware } from '../middleware/auth.js';

const feedback = new Hono();

// Apply authentication middleware to all routes
feedback.use('*', authMiddleware);

/**
 * Send a feedback message to a user
 */
feedback.post(
  '/send',
  zValidator('json', sendFeedbackMessageRequestSchema),
  async (c) => {
    try {
      const request = c.req.valid('json');
      
      const result = await FeedbackDomain.sendFeedbackMessage(request);
      
      return ResponseBuilder.success(c, {
        message: 'Feedback message sent successfully',
        data: result,
      });
    } catch (error) {
      console.error('Send feedback message error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to send feedback message',
        500,
        'FEEDBACK_SEND_ERROR'
      ));
    }
  }
);

/**
 * Process a feedback response (typically called internally by webhook)
 */
feedback.post(
  '/process-response',
  zValidator('json', processFeedbackResponseRequestSchema),
  async (c) => {
    try {
      const request = c.req.valid('json');
      
      const result = await FeedbackDomain.processFeedbackResponse(request);
      
      return ResponseBuilder.success(c, {
        message: 'Feedback response processed successfully',
        data: result,
      });
    } catch (error) {
      console.error('Process feedback response error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to process feedback response',
        500,
        'FEEDBACK_PROCESSING_ERROR'
      ));
    }
  }
);

/**
 * Validate feedback configuration
 */
feedback.post(
  '/validate-config',
  zValidator('json', validateFeedbackConfigRequestSchema),
  async (c) => {
    try {
      const { feedbackConfig } = c.req.valid('json');
      
      const validation = FeedbackDomain.validateFeedbackConfig(feedbackConfig);
      
      return ResponseBuilder.success(c, {
        message: 'Feedback configuration validated',
        data: validation,
      });
    } catch (error) {
      console.error('Validate feedback config error:', error);
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to validate feedback configuration',
        500,
        'VALIDATION_ERROR'
      ));
    }
  }
);

/**
 * Get feedback statistics for a protocol
 */
feedback.get(
  '/statistics/:protocolId',
  zValidator('param', z.object({
    protocolId: z.string().uuid('Invalid protocol ID'),
  })),
  zValidator('query', z.object({
    stepId: z.string().uuid().optional(),
  })),
  async (c) => {
    try {
      const { protocolId } = c.req.valid('param');
      const { stepId } = c.req.valid('query');
      
      const statistics = await FeedbackDomain.getFeedbackStatistics(protocolId, stepId);
      
      return ResponseBuilder.success(c, {
        message: 'Feedback statistics retrieved successfully',
        data: statistics,
      });
    } catch (error) {
      console.error('Get feedback statistics error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get feedback statistics',
        500,
        'STATISTICS_ERROR'
      ));
    }
  }
);

/**
 * Get feedback metrics for a protocol with optional date range
 */
feedback.get(
  '/metrics/:protocolId',
  zValidator('param', z.object({
    protocolId: z.string().uuid('Invalid protocol ID'),
  })),
  zValidator('query', z.object({
    stepId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })),
  async (c) => {
    try {
      const { protocolId } = c.req.valid('param');
      const { stepId, dateFrom, dateTo } = c.req.valid('query');
      
      const metrics = await FeedbackRepository.getFeedbackMetrics(
        protocolId,
        stepId,
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined
      );
      
      return ResponseBuilder.success(c, {
        message: 'Feedback metrics retrieved successfully',
        data: metrics,
      });
    } catch (error) {
      console.error('Get feedback metrics error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get feedback metrics',
        500,
        'METRICS_ERROR'
      ));
    }
  }
);

/**
 * Get recent feedback responses for monitoring
 */
feedback.get(
  '/recent-responses',
  zValidator('query', z.object({
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
    protocolId: z.string().uuid().optional(),
  })),
  async (c) => {
    try {
      const { limit = 20, protocolId } = c.req.valid('query');
      
      const responses = await FeedbackRepository.getRecentFeedbackResponses(limit, protocolId);
      
      return ResponseBuilder.success(c, {
        message: 'Recent feedback responses retrieved successfully',
        data: responses,
      });
    } catch (error) {
      console.error('Get recent feedback responses error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get recent feedback responses',
        500,
        'RESPONSES_ERROR'
      ));
    }
  }
);

/**
 * Get pending feedback messages (sent but not responded)
 */
feedback.get(
  '/pending',
  zValidator('query', z.object({
    userId: z.string().uuid().optional(),
    olderThanHours: z.string().transform(Number).pipe(z.number().min(1)).optional(),
  })),
  async (c) => {
    try {
      const { userId, olderThanHours } = c.req.valid('query');
      
      const pending = await FeedbackRepository.getPendingFeedbackMessages(userId, olderThanHours);
      
      return ResponseBuilder.success(c, {
        message: 'Pending feedback messages retrieved successfully',
        data: pending,
      });
    } catch (error) {
      console.error('Get pending feedback messages error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get pending feedback messages',
        500,
        'PENDING_ERROR'
      ));
    }
  }
);

/**
 * Mark old messages as missed
 */
feedback.post(
  '/mark-missed',
  zValidator('json', z.object({
    hoursThreshold: z.number().min(1).max(168).optional(), // Max 1 week
  })),
  async (c) => {
    try {
      const { hoursThreshold = 24 } = c.req.valid('json');
      
      const markedCount = await FeedbackRepository.markMissedMessages(hoursThreshold);
      
      return ResponseBuilder.success(c, {
        message: `Marked ${markedCount} messages as missed`,
        data: { markedCount, hoursThreshold },
      });
    } catch (error) {
      console.error('Mark missed messages error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to mark missed messages',
        500,
        'MARK_MISSED_ERROR'
      ));
    }
  }
);

/**
 * Get interaction logs for a user
 */
feedback.get(
  '/interactions/:userId',
  zValidator('param', z.object({
    userId: z.string().uuid('Invalid user ID'),
  })),
  zValidator('query', z.object({
    protocolId: z.string().uuid().optional(),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  })),
  async (c) => {
    try {
      const { userId } = c.req.valid('param');
      const { protocolId, limit = 50 } = c.req.valid('query');
      
      const logs = await FeedbackRepository.getInteractionLogs(userId, protocolId, limit);
      
      return ResponseBuilder.success(c, {
        message: 'Interaction logs retrieved successfully',
        data: logs,
      });
    } catch (error) {
      console.error('Get interaction logs error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get interaction logs',
        500,
        'LOGS_ERROR'
      ));
    }
  }
);

export { feedback };