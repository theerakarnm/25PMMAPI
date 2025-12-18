import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { JobManager } from '../core/jobs/queue.js';
import { ProtocolScheduler } from '../core/jobs/scheduler.js';
import { MessageDeliveryService } from '../core/jobs/message-delivery-service.js';
import { AppError } from '../core/errors/app-error.js';

const jobs = new Hono();

// All job endpoints require authentication
jobs.use('*', requireAuth);

/**
 * Get comprehensive job system statistics
 */
jobs.get('/stats', async (c) => {
  try {
    const stats = await ProtocolScheduler.getStats();
    
    return ResponseBuilder.success(c, {
      scheduler: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get job stats:', error);
    return ResponseBuilder.error(c, new AppError('Failed to retrieve job statistics', 500));
  }
});

/**
 * Get delivery statistics for a specific time range
 */
jobs.get('/delivery-stats', async (c) => {
  try {
    const fromParam = c.req.query('from');
    const toParam = c.req.query('to');
    
    let timeRange: { from: Date; to: Date } | undefined;
    
    if (fromParam && toParam) {
      timeRange = {
        from: new Date(fromParam),
        to: new Date(toParam),
      };
    }
    
    const stats = await MessageDeliveryService.getDeliveryStats(timeRange);
    
    return ResponseBuilder.success(c, {
      deliveryStats: stats,
      timeRange,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get delivery stats:', error);
    return ResponseBuilder.error(c, new AppError('Failed to retrieve delivery statistics', 500));
  }
});

/**
 * Get failed deliveries for manual review
 */
jobs.get('/failed-deliveries', async (c) => {
  try {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    
    const failedDeliveries = await MessageDeliveryService.getFailedDeliveries(limit);
    
    return ResponseBuilder.success(c, {
      failedDeliveries,
      count: failedDeliveries.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get failed deliveries:', error);
    return ResponseBuilder.error(c, new AppError('Failed to retrieve failed deliveries', 500));
  }
});

/**
 * Manually retry failed deliveries
 */
jobs.post('/retry-failed', async (c) => {
  try {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    
    const retriedCount = await JobManager.retryFailedDeliveries(limit);
    
    return ResponseBuilder.success(c, {
      retriedCount,
      message: `Successfully queued ${retriedCount} failed deliveries for retry`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to retry deliveries:', error);
    return ResponseBuilder.error(c, new AppError('Failed to retry failed deliveries', 500));
  }
});

/**
 * Manually trigger maintenance tasks
 */
jobs.post('/maintenance', async (c) => {
  try {
    await ProtocolScheduler.performMaintenance();
    
    return ResponseBuilder.success(c, {
      message: 'Maintenance tasks completed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to run maintenance:', error);
    return ResponseBuilder.error(c, new AppError('Failed to run maintenance tasks', 500));
  }
});

/**
 * Clean up old jobs manually
 */
jobs.post('/cleanup', async (c) => {
  try {
    const hoursParam = c.req.query('hours');
    const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
    
    await JobManager.cleanupOldJobs(hours);
    
    return ResponseBuilder.success(c, {
      message: `Successfully cleaned up jobs older than ${hours} hours`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to cleanup jobs:', error);
    return ResponseBuilder.error(c, new AppError('Failed to cleanup old jobs', 500));
  }
});

/**
 * Health check for job system
 */
jobs.get('/health', async (c) => {
  try {
    const stats = await JobManager.getQueueStats();
    
    // Check if queues are responsive
    const isHealthy = stats.messageQueue && stats.scheduledQueue;
    
    if (isHealthy) {
      return ResponseBuilder.success(c, {
        status: 'healthy',
        queues: stats,
        timestamp: new Date().toISOString(),
      });
    } else {
      return ResponseBuilder.error(c, new AppError('Job system is unhealthy', 503, 'JOB_SYSTEM_UNHEALTHY'));
    }
  } catch (error) {
    console.error('Job health check failed:', error);
    return ResponseBuilder.error(c, new AppError('Job system health check failed', 503, 'HEALTH_CHECK_FAILED'));
  }
});

export { jobs };