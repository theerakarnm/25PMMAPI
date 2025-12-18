import cron from 'node-cron';
import { database } from '../database/connection.js';
import { protocolAssignments, protocolSteps, protocols, users } from '../database/schema.js';
import { eq, and } from 'drizzle-orm';
import { JobManager, MessageJobData } from './queue.js';

export class ProtocolScheduler {
  private static cronJobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Initialize the protocol scheduler with maintenance tasks
   */
  static initialize(): void {
    console.log('Initializing protocol scheduler...');
    
    // Run every minute to check for scheduled messages
    const protocolTask = cron.schedule('* * * * *', async () => {
      await this.processScheduledProtocols();
    }, {
      scheduled: false,
    });

    // Run maintenance tasks every hour
    const maintenanceTask = cron.schedule('0 * * * *', async () => {
      await this.performMaintenance();
    }, {
      scheduled: false,
    });

    // Run failed delivery retry every 15 minutes
    const retryTask = cron.schedule('*/15 * * * *', async () => {
      await this.processFailedDeliveries();
    }, {
      scheduled: false,
    });

    protocolTask.start();
    maintenanceTask.start();
    retryTask.start();
    
    this.cronJobs.set('protocol-processor', protocolTask);
    this.cronJobs.set('maintenance', maintenanceTask);
    this.cronJobs.set('retry-processor', retryTask);
    
    console.log('✅ Protocol scheduler started with maintenance tasks');
  }

  /**
   * Process all scheduled protocols and send due messages
   */
  private static async processScheduledProtocols(): Promise<void> {
    try {
      const now = new Date();
      
      // Get all active protocol assignments
      const activeAssignments = await database
        .select({
          assignment: protocolAssignments,
          user: users,
          protocol: protocols,
        })
        .from(protocolAssignments)
        .innerJoin(users, eq(protocolAssignments.userId, users.id))
        .innerJoin(protocols, eq(protocolAssignments.protocolId, protocols.id))
        .where(
          and(
            eq(protocolAssignments.status, 'active'),
            eq(users.status, 'active'),
            eq(protocols.status, 'active')
          )
        );

      for (const { assignment, user, protocol } of activeAssignments) {
        await this.processAssignmentSteps(assignment, user, protocol, now);
      }
    } catch (error) {
      console.error('Error processing scheduled protocols:', error);
    }
  }

  /**
   * Process steps for a specific protocol assignment
   */
  private static async processAssignmentSteps(
    assignment: any,
    user: any,
    protocol: any,
    now: Date
  ): Promise<void> {
    try {
      // Get all steps for this protocol
      const steps = await database
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocol.id))
        .orderBy(protocolSteps.stepOrder);

      for (const step of steps) {
        const shouldSend = await this.shouldSendStep(assignment, step, now);
        
        if (shouldSend) {
          await this.sendProtocolStep(assignment, user, step);
        }
      }
    } catch (error) {
      console.error(`Error processing steps for assignment ${assignment.id}:`, error);
    }
  }

  /**
   * Determine if a step should be sent based on timing configuration
   */
  private static async shouldSendStep(
    assignment: any,
    step: any,
    now: Date
  ) {
    const assignmentStartTime = assignment.startedAt || assignment.assignedAt;
    
    switch (step.triggerType) {
      case 'immediate':
        // Send immediately when protocol starts (only once)
        return assignment.currentStep === step.stepOrder && 
               assignment.startedAt === null;
        
      case 'delay':
        // Send after specified delay from assignment start
        const delayMs = this.parseDelayValue(step.triggerValue);
        const targetTime = new Date(assignmentStartTime.getTime() + delayMs);
        return now >= targetTime && assignment.currentStep <= step.stepOrder;
        
      case 'scheduled':
        // Send at specific times (daily recurring)
        return this.isScheduledTime(step.triggerValue, now) &&
               assignment.currentStep <= step.stepOrder;
        
      default:
        return false;
    }
  }

  /**
   * Parse delay value (e.g., "1h", "30m", "2d")
   */
  private static parseDelayValue(delayValue: string): number {
    const match = delayValue.match(/^(\d+)([hmsd])$/);
    if (!match) return 0;
    
    const [, amount, unit] = match;
    const num = parseInt(amount, 10);
    
    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }

  /**
   * Check if current time matches scheduled time (e.g., "09:00", "14:30")
   */
  private static isScheduledTime(scheduledTime: string, now: Date): boolean {
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    
    return currentHours === hours && currentMinutes === minutes;
  }

  /**
   * Send a protocol step message
   */
  private static async sendProtocolStep(
    assignment: any,
    user: any,
    step: any
  ): Promise<void> {
    try {
      const messageData: MessageJobData = {
        userId: user.lineUserId,
        protocolId: assignment.protocolId,
        stepId: step.id,
        assignmentId: assignment.id,
        messageType: step.messageType,
        content: this.parseStepContent(step),
        requiresFeedback: step.requiresAction,
        feedbackConfig: step.feedbackConfig,
      };

      // Schedule immediate delivery
      await JobManager.scheduleImmediateMessage(messageData);

      // Update assignment progress
      await database
        .update(protocolAssignments)
        .set({
          currentStep: Math.max(assignment.currentStep, step.stepOrder),
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, assignment.id));

      console.log(`Sent step ${step.stepOrder} to user ${user.displayName}`);
    } catch (error) {
      console.error(`Error sending protocol step:`, error);
    }
  }

  /**
   * Parse step content based on message type
   */
  private static parseStepContent(step: any): any {
    const payload = step.contentPayload;
    
    switch (step.messageType) {
      case 'text':
        return { text: payload.text || payload };
        
      case 'image':
        return {
          imageUrl: payload.imageUrl,
          previewImageUrl: payload.previewImageUrl || payload.imageUrl,
        };
        
      case 'flex':
        return {
          text: payload.altText || 'Flex Message',
          flexContent: payload.contents || payload,
        };
        
      case 'template':
        return {
          templateContent: payload,
        };
        
      default:
        return { text: 'Invalid message type' };
    }
  }

  /**
   * Start a specific protocol assignment
   */
  static async startProtocolAssignment(assignmentId: string): Promise<void> {
    try {
      await database
        .update(protocolAssignments)
        .set({
          status: 'active',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, assignmentId));

      console.log(`Started protocol assignment: ${assignmentId}`);
    } catch (error) {
      console.error(`Error starting protocol assignment:`, error);
      throw error;
    }
  }

  /**
   * Pause a protocol assignment
   */
  static async pauseProtocolAssignment(assignmentId: string): Promise<void> {
    try {
      await database
        .update(protocolAssignments)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, assignmentId));

      // Cancel pending jobs for this assignment
      await JobManager.cancelProtocolJobs(assignmentId);

      console.log(`Paused protocol assignment: ${assignmentId}`);
    } catch (error) {
      console.error(`Error pausing protocol assignment:`, error);
      throw error;
    }
  }

  /**
   * Complete a protocol assignment
   */
  static async completeProtocolAssignment(assignmentId: string): Promise<void> {
    try {
      await database
        .update(protocolAssignments)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, assignmentId));

      // Cancel any remaining jobs
      await JobManager.cancelProtocolJobs(assignmentId);

      console.log(`Completed protocol assignment: ${assignmentId}`);
    } catch (error) {
      console.error(`Error completing protocol assignment:`, error);
      throw error;
    }
  }

  /**
   * Get comprehensive scheduler statistics
   */
  static async getStats() {
    const queueStats = await JobManager.getQueueStats();
    
    return {
      activeCronJobs: this.cronJobs.size,
      queueStats,
      lastProcessedAt: new Date().toISOString(),
    };
  }

  /**
   * Process failed deliveries and retry them
   */
  static async processFailedDeliveries(): Promise<void> {
    try {
      const retriedCount = await JobManager.retryFailedDeliveries(20);
      if (retriedCount > 0) {
        console.log(`🔄 Retried ${retriedCount} failed deliveries`);
      }
    } catch (error) {
      console.error('Error processing failed deliveries:', error);
    }
  }

  /**
   * Perform maintenance tasks
   */
  static async performMaintenance(): Promise<void> {
    try {
      // Clean up old jobs
      await JobManager.cleanupOldJobs(24);
      
      // Process failed deliveries
      await this.processFailedDeliveries();
      
      console.log('✅ Maintenance tasks completed');
    } catch (error) {
      console.error('Error during maintenance:', error);
    }
  }
}