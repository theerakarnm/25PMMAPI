import { Context, Next } from 'hono';
import { logger } from '../core/logging/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface PerformanceMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  userAgent?: string;
  ip?: string;
  contentLength?: number;
}

/**
 * Performance monitoring middleware
 */
export const performanceMiddleware = async (c: Context, next: Next) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const method = c.req.method;
  const path = c.req.path;
  
  // Set request ID for use in other middleware and handlers
  c.set('requestId', requestId);
  c.set('startTime', startTime);
  
  // Add request ID to response headers for debugging
  c.res.headers.set('X-Request-ID', requestId);
  
  try {
    await next();
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const statusCode = c.res.status;
    
    const metrics: PerformanceMetrics = {
      requestId,
      method,
      path,
      statusCode,
      duration,
      timestamp: new Date(startTime),
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      contentLength: c.res.headers.get('content-length') ? 
        parseInt(c.res.headers.get('content-length')!) : undefined,
    };
    
    // Log performance metrics
    const context = {
      requestId,
      method,
      path,
      statusCode,
      userAgent: metrics.userAgent,
      ip: metrics.ip,
    };
    
    // Determine log level based on performance and status
    if (statusCode >= 500) {
      logger.error(`${method} ${path} - Server Error`, undefined, context);
    } else if (statusCode >= 400) {
      logger.warn(`${method} ${path} - Client Error`, context);
    } else if (duration > 5000) {
      logger.warn(`${method} ${path} - Slow Request`, context, {
        duration,
        threshold: 5000,
      });
    } else if (duration > 1000) {
      logger.info(`${method} ${path} - Request`, context);
    } else {
      logger.debug(`${method} ${path} - Request`, context);
    }
    
    // Log detailed performance metrics
    logger.performance(
      `${method} ${path}`,
      duration,
      context,
      {
        contentLength: metrics.contentLength,
        timestamp: metrics.timestamp.toISOString(),
      }
    );
    
    // Store metrics for potential aggregation (could be sent to monitoring service)
    PerformanceCollector.recordMetrics(metrics);
  }
};

/**
 * Performance metrics collector for aggregation and monitoring
 */
export class PerformanceCollector {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS = 1000;
  
  static recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics to prevent memory issues
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }
  
  /**
   * Get performance statistics for a time period
   */
  static getStats(timeRangeMinutes: number = 60): {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    slowRequestRate: number;
    requestsByStatus: Record<string, number>;
    requestsByPath: Record<string, number>;
  } {
    const cutoffTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    
    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        slowRequestRate: 0,
        requestsByStatus: {},
        requestsByPath: {},
      };
    }
    
    // Calculate response time statistics
    const durations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const totalRequests = recentMetrics.length;
    const averageResponseTime = durations.reduce((sum, d) => sum + d, 0) / totalRequests;
    const p95Index = Math.floor(totalRequests * 0.95);
    const p99Index = Math.floor(totalRequests * 0.99);
    const p95ResponseTime = durations[p95Index] || 0;
    const p99ResponseTime = durations[p99Index] || 0;
    
    // Calculate error rates
    const errorRequests = recentMetrics.filter(m => m.statusCode >= 400).length;
    const slowRequests = recentMetrics.filter(m => m.duration > 1000).length;
    const errorRate = (errorRequests / totalRequests) * 100;
    const slowRequestRate = (slowRequests / totalRequests) * 100;
    
    // Group by status code
    const requestsByStatus: Record<string, number> = {};
    for (const metric of recentMetrics) {
      const statusGroup = `${Math.floor(metric.statusCode / 100)}xx`;
      requestsByStatus[statusGroup] = (requestsByStatus[statusGroup] || 0) + 1;
    }
    
    // Group by path
    const requestsByPath: Record<string, number> = {};
    for (const metric of recentMetrics) {
      requestsByPath[metric.path] = (requestsByPath[metric.path] || 0) + 1;
    }
    
    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      p95ResponseTime,
      p99ResponseTime,
      errorRate: Math.round(errorRate * 100) / 100,
      slowRequestRate: Math.round(slowRequestRate * 100) / 100,
      requestsByStatus,
      requestsByPath,
    };
  }
  
  /**
   * Get recent metrics
   */
  static getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit).reverse();
  }
  
  /**
   * Clear collected metrics
   */
  static clearMetrics(): void {
    this.metrics = [];
  }
  
  /**
   * Get metrics for a specific path
   */
  static getPathMetrics(path: string, timeRangeMinutes: number = 60): PerformanceMetrics[] {
    const cutoffTime = new Date(Date.now() - timeRangeMinutes * 60 * 1000);
    return this.metrics.filter(m => 
      m.path === path && m.timestamp >= cutoffTime
    );
  }
}