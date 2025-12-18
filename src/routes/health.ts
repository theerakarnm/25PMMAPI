import { Hono } from 'hono';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { gracefulDegradationManager } from '../core/resilience/graceful-degradation.js';
import { circuitBreakerRegistry } from '../core/resilience/circuit-breaker.js';
import { PerformanceCollector } from '../middleware/performance.js';
import { logger } from '../core/logging/logger.js';
import { database } from '../core/database/connection.js';
import { lineClient } from '../core/line/client.js';
import { redis } from '../core/jobs/queue.js';

const health = new Hono();

/**
 * Basic health check endpoint
 */
health.get('/', async (c) => {
  try {
    const systemHealth = gracefulDegradationManager.getSystemHealth();
    const circuitBreakers = circuitBreakerRegistry.getAllStats();
    const performanceStats = PerformanceCollector.getStats(5); // Last 5 minutes
    
    const healthStatus = {
      status: systemHealth.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: systemHealth.services,
      circuitBreakers,
      performance: performanceStats,
    };

    logger.info('Health check requested', {
      status: systemHealth.status,
      serviceCount: systemHealth.summary.total,
      healthyServices: systemHealth.summary.healthy,
    });

    return ResponseBuilder.success(c, healthStatus);
  } catch (error) {
    logger.error('Health check failed', error as Error);
    return ResponseBuilder.error(c, error as Error);
  }
});

/**
 * Detailed health check with dependency testing
 */
health.get('/detailed', async (c) => {
  try {
    const checks = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
      checkLineApi(),
    ]);

    const results = {
      database: getCheckResult(checks[0]),
      redis: getCheckResult(checks[1]),
      lineApi: getCheckResult(checks[2]),
    };

    const allHealthy = Object.values(results).every(r => r.healthy);
    const systemHealth = gracefulDegradationManager.getSystemHealth();
    const circuitBreakers = circuitBreakerRegistry.getAllStats();
    const performanceStats = PerformanceCollector.getStats(15); // Last 15 minutes
    const recentLogs = logger.getRecentLogs(50);

    const detailedHealth = {
      status: allHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      dependencies: results,
      services: systemHealth.services,
      circuitBreakers,
      performance: performanceStats,
      recentLogs: recentLogs.slice(0, 10), // Only include recent errors/warnings
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
    };

    logger.info('Detailed health check requested', {
      status: detailedHealth.status,
      allHealthy,
      memoryUsed: detailedHealth.memory.used,
    });

    return ResponseBuilder.success(c, detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed', error as Error);
    return ResponseBuilder.error(c, error as Error);
  }
});

/**
 * Readiness probe for Kubernetes/container orchestration
 */
health.get('/ready', async (c) => {
  try {
    // Check critical dependencies
    const [dbCheck, redisCheck] = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
    ]);

    const dbHealthy = dbCheck.status === 'fulfilled' && dbCheck.value;
    const redisHealthy = redisCheck.status === 'fulfilled' && redisCheck.value;

    if (dbHealthy && redisHealthy) {
      return ResponseBuilder.success(c, {
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      return ResponseBuilder.error(c, {
        name: 'ReadinessError',
        message: 'Service not ready',
        statusCode: 503,
      } as any, 503);
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    return ResponseBuilder.error(c, error as Error, 503);
  }
});

/**
 * Liveness probe for Kubernetes/container orchestration
 */
health.get('/live', async (c) => {
  try {
    // Basic liveness check - just ensure the process is responsive
    return ResponseBuilder.success(c, {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error('Liveness check failed', error as Error);
    return ResponseBuilder.error(c, error as Error, 503);
  }
});

/**
 * Performance metrics endpoint
 */
health.get('/metrics', async (c) => {
  try {
    const timeRange = parseInt(c.req.query('timeRange') || '60'); // Default 60 minutes
    const performanceStats = PerformanceCollector.getStats(timeRange);
    const recentMetrics = PerformanceCollector.getRecentMetrics(100);
    
    return ResponseBuilder.success(c, {
      timeRangeMinutes: timeRange,
      stats: performanceStats,
      recentRequests: recentMetrics.slice(0, 20), // Last 20 requests
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Metrics endpoint failed', error as Error);
    return ResponseBuilder.error(c, error as Error);
  }
});

/**
 * Circuit breaker status endpoint
 */
health.get('/circuit-breakers', async (c) => {
  try {
    const circuitBreakers = circuitBreakerRegistry.getAllStats();
    
    return ResponseBuilder.success(c, {
      circuitBreakers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Circuit breaker status check failed', error as Error);
    return ResponseBuilder.error(c, error as Error);
  }
});

/**
 * Reset circuit breakers (for emergency recovery)
 */
health.post('/circuit-breakers/reset', async (c) => {
  try {
    circuitBreakerRegistry.resetAll();
    
    logger.info('All circuit breakers reset via API');
    
    return ResponseBuilder.success(c, {
      message: 'All circuit breakers reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Circuit breaker reset failed', error as Error);
    return ResponseBuilder.error(c, error as Error);
  }
});

// Helper functions
async function checkDatabase(): Promise<boolean> {
  try {
    await database.execute('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed', error as Error);
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed', error as Error);
    return false;
  }
}

async function checkLineApi(): Promise<boolean> {
  try {
    // Simple check - just verify the client is configured
    const client = lineClient.getClient();
    return !!client;
  } catch (error) {
    logger.error('LINE API health check failed', error as Error);
    return false;
  }
}

function getCheckResult(result: PromiseSettledResult<boolean>): {
  healthy: boolean;
  error?: string;
  timestamp: string;
} {
  return {
    healthy: result.status === 'fulfilled' && result.value,
    error: result.status === 'rejected' ? result.reason?.message : undefined,
    timestamp: new Date().toISOString(),
  };
}

export { health };