import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { lineClient } from '../line/client.js';
import { database } from '../database/connection.js';
import { interactionLogs } from '../database/schema.js';
import { v4 as uuidv4 } from 'uuid';

// Redis connection
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

// Job data interfaces
export interface MessageJobData {
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
      action: string;
    }>;
  };
}

export interface ScheduledMessageJobData extends MessageJobData {
  scheduledAt: Date;
}

// Create queues
export const messageQueue = new Queue('message-delivery', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const scheduledMessageQueue = new Queue('scheduled-messages', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Message delivery worker
const messageWorker = new Worker(
  'message-delivery',
  async (job: Job<MessageJobData>) => {
    const data = job.data;
    
    try {
      // Log message as sent
      const logId = uuidv4();
      const sentAt = new Date();
      
      await database.insert(interactionLogs).values({
        id: logId,
        userId: data.userId,
        protocolId: data.protocolId,
        stepId: data.stepId,
        assignmentId: data.assignmentId,
        sentAt,
        status: 'sent',
        createdAt: new Date(),
      });

      // Send the message based on type
      switch (data.messageType) {
        case 'text':
          await lineClient.sendTextMessage(data.userId, data.content.text!);
          break;
          
        case 'image':
          await lineClient.sendImageMessage(
            data.userId,
            data.content.imageUrl!,
            data.content.previewImageUrl!
          );
          break;
          
        case 'flex':
          await lineClient.sendFlexMessage(
            data.userId,
            data.content.text || 'Flex Message',
            data.content.flexContent
          );
          break;
          
        case 'template':
          if (data.requiresFeedback && data.feedbackConfig) {
            const buttons = data.feedbackConfig.buttons.map(button => ({
              type: 'postback' as const,
              label: button.label,
              data: `${data.protocolId}:${data.stepId}:${button.value}`,
            }));
            
            await lineClient.sendButtonTemplate(
              data.userId,
              data.feedbackConfig.question,
              buttons
            );
          }
          break;
      }

      // Update log as delivered
      await database
        .update(interactionLogs)
        .set({
          deliveredAt: new Date(),
          status: 'delivered',
        })
        .where(eq(interactionLogs.id, logId));

      console.log(`Message delivered successfully to user ${data.userId}`);
      
    } catch (error) {
      console.error('Failed to deliver message:', error);
      throw error; // This will trigger retry logic
    }
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

// Scheduled message worker
const scheduledMessageWorker = new Worker(
  'scheduled-messages',
  async (job: Job<ScheduledMessageJobData>) => {
    const data = job.data;
    
    // Add to immediate message queue for processing
    await messageQueue.add('deliver-message', data, {
      priority: 1,
    });
    
    console.log(`Scheduled message queued for delivery to user ${data.userId}`);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

// Job queue management functions
export class JobManager {
  /**
   * Schedule an immediate message delivery
   */
  static async scheduleImmediateMessage(data: MessageJobData): Promise<void> {
    await messageQueue.add('deliver-message', data, {
      priority: 1,
    });
  }

  /**
   * Schedule a delayed message delivery
   */
  static async scheduleDelayedMessage(
    data: MessageJobData,
    delayMs: number
  ): Promise<void> {
    await messageQueue.add('deliver-message', data, {
      delay: delayMs,
      priority: 2,
    });
  }

  /**
   * Schedule a message for a specific time
   */
  static async scheduleMessageAt(
    data: MessageJobData,
    scheduledAt: Date
  ): Promise<void> {
    const delay = scheduledAt.getTime() - Date.now();
    
    if (delay <= 0) {
      // Schedule immediately if time has passed
      await this.scheduleImmediateMessage(data);
    } else {
      await scheduledMessageQueue.add('scheduled-message', {
        ...data,
        scheduledAt,
      }, {
        delay,
        priority: 3,
      });
    }
  }

  /**
   * Schedule recurring messages (daily at specific time)
   */
  static async scheduleRecurringMessage(
    data: MessageJobData,
    cronPattern: string
  ): Promise<void> {
    await scheduledMessageQueue.add('recurring-message', data, {
      repeat: {
        pattern: cronPattern,
      },
      priority: 4,
    });
  }

  /**
   * Cancel all jobs for a specific protocol assignment
   */
  static async cancelProtocolJobs(assignmentId: string): Promise<void> {
    const jobs = await messageQueue.getJobs(['waiting', 'delayed']);
    const scheduledJobs = await scheduledMessageQueue.getJobs(['waiting', 'delayed']);
    
    for (const job of [...jobs, ...scheduledJobs]) {
      if (job.data.assignmentId === assignmentId) {
        await job.remove();
      }
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats() {
    const messageStats = await messageQueue.getJobCounts();
    const scheduledStats = await scheduledMessageQueue.getJobCounts();
    
    return {
      messageQueue: messageStats,
      scheduledQueue: scheduledStats,
    };
  }
}

// Error handling for workers
messageWorker.on('failed', (job, err) => {
  console.error(`Message job ${job?.id} failed:`, err);
});

scheduledMessageWorker.on('failed', (job, err) => {
  console.error(`Scheduled message job ${job?.id} failed:`, err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await messageWorker.close();
  await scheduledMessageWorker.close();
  await redis.quit();
});

export { redis };