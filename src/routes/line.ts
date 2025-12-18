import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WebhookEvent } from '@line/bot-sdk';
import { LineWebhookHandler } from '../core/line/webhook-handler.js';
import { lineClient } from '../core/line/client.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { AppError } from '../core/errors/app-error.js';

const line = new Hono();

// Webhook validation schema
const webhookSchema = z.object({
  events: z.array(z.any()), // LINE webhook events have complex structure
  destination: z.string().optional(),
});

/**
 * LINE webhook endpoint
 * Receives events from LINE platform (follow, postback, message, etc.)
 */
line.post(
  '/webhook',
  zValidator('json', webhookSchema),
  async (c) => {
    try {
      // Verify webhook signature
      const signature = c.req.header('x-line-signature');
      const body = await c.req.text();
      
      if (!signature) {
        throw new AppError(
          'Missing LINE signature header',
          400,
          'INVALID_SIGNATURE'
        );
      }

      const isValidSignature = lineClient.validateSignature(body, signature);
      if (!isValidSignature) {
        throw new AppError(
          'Invalid LINE webhook signature',
          401,
          'INVALID_SIGNATURE'
        );
      }

      // Parse and process events
      const webhookData = JSON.parse(body);
      const events: WebhookEvent[] = webhookData.events || [];

      if (events.length === 0) {
        return ResponseBuilder.success(c, { message: 'No events to process' });
      }

      // Process events asynchronously
      await LineWebhookHandler.handleEvents(events);

      return ResponseBuilder.success(c, {
        message: 'Events processed successfully',
        eventsCount: events.length,
      });
    } catch (error) {
      console.error('LINE webhook error:', error);
      
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to process LINE webhook',
        500,
        'WEBHOOK_ERROR'
      ));
    }
  }
);

/**
 * Get LINE bot status and configuration
 */
line.get('/status', async (c) => {
  try {
    // Basic health check - try to get bot info
    const client = lineClient.getClient();
    
    return ResponseBuilder.success(c, {
      status: 'connected',
      timestamp: new Date().toISOString(),
      webhookUrl: process.env.LINE_WEBHOOK_URL,
    });
  } catch (error) {
    console.error('LINE status check error:', error);
    
    return ResponseBuilder.error(c, new AppError(
      'LINE API connection failed',
      500,
      'LINE_CONNECTION_ERROR'
    ));
  }
});

/**
 * Send test message (for development/testing)
 */
line.post(
  '/test-message',
  zValidator('json', z.object({
    userId: z.string().min(1, 'User ID is required'),
    message: z.string().min(1, 'Message is required'),
  })),
  async (c) => {
    try {
      const { userId, message } = c.req.valid('json');
      
      await lineClient.sendTextMessage(userId, message);
      
      return ResponseBuilder.success(c, {
        message: 'Test message sent successfully',
        userId,
      });
    } catch (error) {
      console.error('Test message error:', error);
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to send test message',
        500,
        'MESSAGE_SEND_ERROR'
      ));
    }
  }
);

/**
 * Get user profile from LINE
 */
line.get(
  '/user/:userId',
  async (c) => {
    try {
      const userId = c.req.param('userId');
      
      if (!userId) {
        throw new AppError(
          'User ID is required',
          400,
          'MISSING_USER_ID'
        );
      }
      
      const profile = await lineClient.getUserProfile(userId);
      
      return ResponseBuilder.success(c, {
        profile,
      });
    } catch (error) {
      console.error('Get user profile error:', error);
      
      return ResponseBuilder.error(c, new AppError(
        'Failed to get user profile',
        500,
        'PROFILE_FETCH_ERROR'
      ));
    }
  }
);

export { line };