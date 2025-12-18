import { logger } from '../logging/logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
  name: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextRetryTime?: Date;
}

/**
 * Circuit breaker implementation for preventing cascade failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextRetryTime?: Date;
  private halfOpenCalls: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
        logger.info(`Circuit breaker ${this.config.name} transitioning to HALF_OPEN`);
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.config.name} is OPEN. Next retry at ${this.nextRetryTime?.toISOString()}`
        );
      }
    }

    if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker ${this.config.name} is HALF_OPEN and max calls exceeded`
      );
    }

    this.totalCalls++;
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.onSuccess();
      
      const duration = Date.now() - startTime;
      logger.performance(
        `Circuit breaker ${this.config.name} call succeeded`,
        duration,
        { circuitState: this.state }
      );
      
      return result;
    } catch (error) {
      this.onFailure();
      
      logger.error(
        `Circuit breaker ${this.config.name} call failed`,
        error as Error,
        { circuitState: this.state }
      );
      
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // If we've had enough successful calls in half-open state, close the circuit
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        logger.info(`Circuit breaker ${this.config.name} transitioning to CLOSED after successful recovery`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state should open the circuit
      this.openCircuit();
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      // Too many failures in closed state should open the circuit
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
    
    logger.warn(
      `Circuit breaker ${this.config.name} transitioning to OPEN`,
      {
        failureCount: this.failureCount,
        nextRetryTime: this.nextRetryTime.toISOString(),
      }
    );
  }

  private shouldAttemptReset(): boolean {
    return this.nextRetryTime ? Date.now() >= this.nextRetryTime.getTime() : false;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = undefined;
    this.nextRetryTime = undefined;
    
    logger.info(`Circuit breaker ${this.config.name} manually reset`);
  }

  /**
   * Force the circuit breaker to open (for testing or emergency)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
    
    logger.warn(`Circuit breaker ${this.config.name} manually forced to OPEN`);
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private breakers: Map<string, CircuitBreaker> = new Map();

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        monitoringPeriod: 300000, // 5 minutes
        halfOpenMaxCalls: 3,
        name,
      };

      const finalConfig = { ...defaultConfig, ...config };
      this.breakers.set(name, new CircuitBreaker(finalConfig));
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    
    logger.info('All circuit breakers reset');
  }

  /**
   * Get circuit breaker by name
   */
  getBreakersInState(state: CircuitState): string[] {
    const result: string[] = [];
    
    for (const [name, breaker] of this.breakers) {
      if (breaker.getStats().state === state) {
        result.push(name);
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();