import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { database } from './core/database/connection.js';
import { errorMiddleware } from './middleware/error.js';
import { performanceMiddleware } from './middleware/performance.js';
import { auth } from './routes/auth.js';
import { users } from './routes/users.js';
import { line } from './routes/line.js';
import protocols from './routes/protocols.js';
import protocolAssignments from './routes/protocol-assignments.js';
import { feedback } from './routes/feedback.js';
import { jobs } from './routes/jobs.js';
import research from './routes/research.js';
import { health } from './routes/health.js';
import { dataIntegrity } from './routes/data-integrity.js';
import { env } from './core/config/env.js';
import { ProtocolScheduler } from './core/jobs/scheduler.js';
import { logger } from './core/logging/logger.js';
import { gracefulDegradationManager } from './core/resilience/graceful-degradation.js';
import { redis } from './core/jobs/queue.js';
import { lineClient } from './core/line/client.js';

const app = new Hono();

// Initialize services and resilience patterns
await initializeServices();

// Initialize job scheduler
ProtocolScheduler.initialize();

// Global middleware
app.use('*', performanceMiddleware);
app.use('*', honoLogger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
  credentials: true,
}));
app.use('*', errorMiddleware);

// API routes
app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/line', line);
app.route('/api/protocols', protocols);
app.route('/api/protocol-assignments', protocolAssignments);
app.route('/api/feedback', feedback);
app.route('/api/jobs', jobs);
app.route('/api/research', research);
app.route('/api/data-integrity', dataIntegrity);
app.route('/health', health);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
    meta: {
      timestamp: new Date().toISOString(),
      path: c.req.path,
      method: c.req.method,
    },
  }, 404);
});

/**
 * Initialize services for health monitoring and graceful degradation
 */
async function initializeServices(): Promise<void> {
  logger.info('Initializing services for health monitoring');

  // Register database service
  gracefulDegradationManager.registerService(
    'database',
    async () => {
      try {
        await database.execute('SELECT 1');
        return true;
      } catch (error) {
        return false;
      }
    },
    async () => {
      // Fallback: return cached data or minimal functionality
      logger.warn('Database unavailable, using fallback mode');
      return null;
    }
  );

  // Register Redis service
  gracefulDegradationManager.registerService(
    'redis',
    async () => {
      try {
        await redis.ping();
        return true;
      } catch (error) {
        return false;
      }
    },
    async () => {
      // Fallback: disable job scheduling temporarily
      logger.warn('Redis unavailable, job scheduling disabled');
      return null;
    }
  );

  // Register LINE API service
  gracefulDegradationManager.registerService(
    'line-api',
    async () => {
      try {
        // Simple check - verify client is configured
        const client = lineClient.getClient();
        return !!client;
      } catch (error) {
        return false;
      }
    },
    async () => {
      // Fallback: queue messages for later delivery
      logger.warn('LINE API unavailable, messages will be queued');
      return `fallback_${Date.now()}`;
    }
  );

  logger.info('Services initialized for health monitoring');
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, starting graceful shutdown');
  
  try {
    // Close database connections
    // Note: Drizzle doesn't expose a close method, but the underlying connection should be handled
    
    // Close Redis connection
    await redis.quit();
    
    // Shutdown graceful degradation manager
    gracefulDegradationManager.shutdown();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error as Error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, starting graceful shutdown');
  
  try {
    await redis.quit();
    gracefulDegradationManager.shutdown();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error as Error);
    process.exit(1);
  }
});

logger.info(`Server is running on port ${env.PORT}`, {
  environment: env.NODE_ENV,
  port: env.PORT,
});

export default {
  port: env.PORT,
  fetch: app.fetch,
};
