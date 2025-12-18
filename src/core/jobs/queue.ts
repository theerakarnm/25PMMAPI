import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { MessageDeliveryService, MessageDeliveryOptions } from './message-delivery-service.js';

// Redis connection
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
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
      action: 'complete' | 'postpone' | 'skip';
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
      const result = await MessageDeliveryService.deliverMessage({
        userId: data.userId,
        protocolId: data.protocolId,
        stepId: data.stepId,
        assignmentId: data.assignmentId,
        messageType: data.messageType,
        content: data.content,
        requiresFeedback: data.requiresFeedback,
        feedbackConfig: data.feedbackConfig,
        retryAttempt: job.attemptsMade,
        maxRetries: 3,
      });

      if (!result.success && result.retryable) {
        throw new Error(result.error || 'Message delivery failed');
      }

      if (!result.success) {
        console.error(`❌ Non-retryable error for user ${data.userId}: ${result.error}`);
      }
      
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
   * Get comprehensive queue statistics
   */
  static async getQueueStats() {
    const messageStats = await messageQueue.getJobCounts();
    const scheduledStats = await scheduledMessageQueue.getJobCounts();
    const deliveryStats = await MessageDeliveryService.getDeliveryStats();
    
    return {
      messageQueue: messageStats,
      scheduledQueue: scheduledStats,
      deliveryStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retry failed deliveries
   */
  static async retryFailedDeliveries(limit: number = 50): Promise<number> {
    const failedDeliveries = await MessageDeliveryService.getFailedDeliveries(limit);
    let retriedCount = 0;

    for (const log of failedDeliveries) {
      try {
        // Reconstruct message data from log
        const messageData: MessageJobData = {
          userId: log.userId,
          protocolId: log.protocolId,
          stepId: log.stepId,
          assignmentId: log.assignmentId,
          messageType: 'text', // Default, would need to be stored in log for accuracy
          content: { text: 'Retry message' }, // Would need actual content from protocol step
          requiresFeedback: false,
        };

        await this.scheduleImmediateMessage(messageData);
        retriedCount++;
      } catch (error) {
        console.error(`Failed to retry delivery for log ${log.id}:`, error);
      }
    }

    return retriedCount;
  }

  /**
   * Clean up old completed jobs
   */
  static async cleanupOldJobs(olderThanHours: number = 24): Promise<void> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    try {
      await messageQueue.clean(cutoffTime.getTime(), 100, 'completed');
      await messageQueue.clean(cutoffTime.getTime(), 50, 'failed');
      await scheduledMessageQueue.clean(cutoffTime.getTime(), 100, 'completed');
      await scheduledMessageQueue.clean(cutoffTime.getTime(), 50, 'failed');
      
      console.log(`✅ Cleaned up jobs older than ${olderThanHours} hours`);
    } catch (error) {
      console.error('Failed to clean up old jobs:', error);
    }
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