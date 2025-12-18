import { logger } from '../logging/logger.js';
import { circuitBreakerRegistry, CircuitState } from './circuit-breaker.js';

export enum ServiceStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastCheck: Date;
  errorCount: number;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface DegradationConfig {
  fallbackEnabled: boolean;
  fallbackTimeout: number;
  healthCheckInterval: number;
  maxErrorThreshold: number;
  degradationTimeout: number;
}

/**
 * Graceful degradation manager for handling service failures
 */
export class GracefulDegradationManager {
  private static instance: GracefulDegradationManager;
  private services: Map<string, ServiceHealth> = new Map();
  private fallbackHandlers: Map<string, () => Promise<any>> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  private readonly defaultConfig: DegradationConfig = {
    fallbackEnabled: true,
    fallbackTimeout: 5000,
    healthCheckInterval: 30000, // 30 seconds
    maxErrorThreshold: 5,
    degradationTimeout: 300000, // 5 minutes
  };

  static getInstance(): GracefulDegradationManager {
    if (!GracefulDegradationManager.instance) {
      GracefulDegradationManager.instance = new GracefulDegradationManager();
    }
    return GracefulDegradationManager.instance;
  }

  /**
   * Register a service for health monitoring
   */
  registerService(
    name: string,
    healthCheck: () => Promise<boolean>,
    fallbackHandler?: () => Promise<any>,
    config?: Partial<DegradationConfig>
  ): void {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Initialize service health
    this.services.set(name, {
      name,
      status: ServiceStatus.HEALTHY,
      lastCheck: new Date(),
      errorCount: 0,
    });

    // Register fallback handler if provided
    if (fallbackHandler) {
      this.fallbackHandlers.set(name, fallbackHandler);
    }

    // Start health check interval
    const interval = setInterval(async () => {
      await this.performHealthCheck(name, healthCheck, finalConfig);
    }, finalConfig.healthCheckInterval);

    this.healthCheckIntervals.set(name, interval);

    logger.info(`Service ${name} registered for health monitoring`, {
      service: name,
      config: finalConfig,
    });
  }

  /**
   * Unregister a service
   */
  unregisterService(name: string): void {
    const interval = this.healthCheckIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(name);
    }

    this.services.delete(name);
    this.fallbackHandlers.delete(name);

    logger.info(`Service ${name} unregistered from health monitoring`);
  }

  /**
   * Execute a service call with graceful degradation
   */
  async executeWithDegradation<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallbackValue?: T
  ): Promise<T> {
    const service = this.services.get(serviceName);
    
    if (!service) {
      logger.warn(`Service ${serviceName} not registered, executing without degradation`);
      return await operation();
    }

    // Check if service is available
    if (service.status === ServiceStatus.UNAVAILABLE) {
      logger.warn(`Service ${serviceName} is unavailable, attempting fallback`);
      return await this.executeFallback(serviceName, fallbackValue);
    }

    // Check circuit breaker status
    const circuitBreaker = circuitBreakerRegistry.getBreaker(serviceName);
    const circuitStats = circuitBreaker.getStats();
    
    if (circuitStats.state === CircuitState.OPEN) {
      logger.warn(`Circuit breaker for ${serviceName} is open, attempting fallback`);
      return await this.executeFallback(serviceName, fallbackValue);
    }

    const startTime = Date.now();

    try {
      // Execute the operation through circuit breaker
      const result = await circuitBreaker.execute(operation);
      
      // Update service health on success
      this.updateServiceHealth(serviceName, true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Update service health on failure
      this.updateServiceHealth(serviceName, false);
      
      logger.error(
        `Service ${serviceName} operation failed, attempting fallback`,
        error as Error,
        { service: serviceName }
      );

      return await this.executeFallback(serviceName, fallbackValue);
    }
  }

  /**
   * Execute fallback logic
   */
  private async executeFallback<T>(serviceName: string, fallbackValue?: T): Promise<T> {
    const fallbackHandler = this.fallbackHandlers.get(serviceName);
    
    if (fallbackHandler) {
      try {
        logger.info(`Executing fallback handler for service ${serviceName}`);
        return await fallbackHandler();
      } catch (fallbackError) {
        logger.error(
          `Fallback handler for service ${serviceName} failed`,
          fallbackError as Error,
          { service: serviceName }
        );
      }
    }

    if (fallbackValue !== undefined) {
      logger.info(`Using fallback value for service ${serviceName}`);
      return fallbackValue;
    }

    throw new ServiceUnavailableError(
      `Service ${serviceName} is unavailable and no fallback is configured`
    );
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(
    serviceName: string,
    healthCheck: () => Promise<boolean>,
    config: DegradationConfig
  ): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    const startTime = Date.now();

    try {
      const isHealthy = await Promise.race([
        healthCheck(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), config.fallbackTimeout)
        ),
      ]);

      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        this.updateServiceHealth(serviceName, true, responseTime);
      } else {
        this.updateServiceHealth(serviceName, false);
      }
    } catch (error) {
      logger.error(
        `Health check failed for service ${serviceName}`,
        error as Error,
        { service: serviceName }
      );
      
      this.updateServiceHealth(serviceName, false);
    }
  }

  /**
   * Update service health status
   */
  private updateServiceHealth(
    serviceName: string,
    success: boolean,
    responseTime?: number
  ): void {
    const service = this.services.get(serviceName);
    if (!service) return;

    service.lastCheck = new Date();
    
    if (success) {
      service.errorCount = 0;
      service.responseTime = responseTime;
      
      if (service.status !== ServiceStatus.HEALTHY) {
        service.status = ServiceStatus.HEALTHY;
        logger.info(`Service ${serviceName} recovered to HEALTHY status`);
      }
    } else {
      service.errorCount++;
      
      if (service.errorCount >= this.defaultConfig.maxErrorThreshold) {
        if (service.status !== ServiceStatus.UNAVAILABLE) {
          service.status = ServiceStatus.UNAVAILABLE;
          logger.warn(`Service ${serviceName} marked as UNAVAILABLE`);
        }
      } else if (service.status === ServiceStatus.HEALTHY) {
        service.status = ServiceStatus.DEGRADED;
        logger.warn(`Service ${serviceName} marked as DEGRADED`);
      }
    }

    this.services.set(serviceName, service);
  }

  /**
   * Get health status of all services
   */
  getServicesHealth(): Record<string, ServiceHealth> {
    const health: Record<string, ServiceHealth> = {};
    
    for (const [name, service] of this.services) {
      health[name] = { ...service };
    }
    
    return health;
  }

  /**
   * Get health status of a specific service
   */
  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Check if a service is available
   */
  isServiceAvailable(serviceName: string): boolean {
    const service = this.services.get(serviceName);
    return service ? service.status !== ServiceStatus.UNAVAILABLE : true;
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    status: ServiceStatus;
    services: Record<string, ServiceHealth>;
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unavailable: number;
    };
  } {
    const services = this.getServicesHealth();
    const summary = {
      total: 0,
      healthy: 0,
      degraded: 0,
      unavailable: 0,
    };

    for (const service of Object.values(services)) {
      summary.total++;
      switch (service.status) {
        case ServiceStatus.HEALTHY:
          summary.healthy++;
          break;
        case ServiceStatus.DEGRADED:
          summary.degraded++;
          break;
        case ServiceStatus.UNAVAILABLE:
          summary.unavailable++;
          break;
      }
    }

    let overallStatus = ServiceStatus.HEALTHY;
    if (summary.unavailable > 0) {
      overallStatus = ServiceStatus.UNAVAILABLE;
    } else if (summary.degraded > 0) {
      overallStatus = ServiceStatus.DEGRADED;
    }

    return {
      status: overallStatus,
      services,
      summary,
    };
  }

  /**
   * Manually mark a service as unavailable
   */
  markServiceUnavailable(serviceName: string, reason?: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = ServiceStatus.UNAVAILABLE;
      service.details = { reason, markedAt: new Date().toISOString() };
      
      logger.warn(`Service ${serviceName} manually marked as unavailable`, {
        service: serviceName,
        reason,
      });
    }
  }

  /**
   * Manually restore a service
   */
  restoreService(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = ServiceStatus.HEALTHY;
      service.errorCount = 0;
      service.details = { restoredAt: new Date().toISOString() };
      
      logger.info(`Service ${serviceName} manually restored`, {
        service: serviceName,
      });
    }
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    
    this.healthCheckIntervals.clear();
    this.services.clear();
    this.fallbackHandlers.clear();
    
    logger.info('Graceful degradation manager shutdown complete');
  }
}

/**
 * Error thrown when a service is unavailable and no fallback is available
 */
export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

// Export singleton instance
export const gracefulDegradationManager = GracefulDegradationManager.getInstance();