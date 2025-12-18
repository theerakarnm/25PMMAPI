import { logger } from '../logging/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
  name?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

/**
 * Retry mechanism with exponential backoff and jitter
 */
export class RetryManager {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: (error: any) => {
      // Default retryable conditions
      if (error?.response?.status >= 500) return true;
      if (error?.code === 'ECONNRESET') return true;
      if (error?.code === 'ETIMEDOUT') return true;
      if (error?.code === 'ENOTFOUND') return true;
      if (error?.message?.includes('temporarily unavailable')) return true;
      return false;
    },
  };

  /**
   * Execute a function with retry logic
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        if (attempt > 1) {
          logger.info(
            `Retry succeeded on attempt ${attempt}`,
            { 
              operation: finalConfig.name,
              attempts: attempt,
              totalDuration: Date.now() - startTime,
            }
          );
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!finalConfig.retryableErrors!(error)) {
          logger.debug(
            `Non-retryable error encountered`,
            { 
              operation: finalConfig.name,
              attempt,
              error: lastError.message,
            }
          );
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === finalConfig.maxAttempts) {
          logger.error(
            `All retry attempts exhausted`,
            lastError,
            { 
              operation: finalConfig.name,
              attempts: attempt,
              totalDuration: Date.now() - startTime,
            }
          );
          throw error;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, finalConfig);
        
        logger.warn(
          `Retry attempt ${attempt} failed, retrying in ${delay}ms`,
          { 
            operation: finalConfig.name,
            attempt,
            error: lastError.message,
            nextDelay: delay,
          }
        );

        // Call retry callback if provided
        if (finalConfig.onRetry) {
          finalConfig.onRetry(attempt, error);
        }

        // Wait before next attempt
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Execute with retry and return detailed result
   */
  static async executeWithRetryResult<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let attempts = 0;

    try {
      const result = await this.executeWithRetry(fn, {
        ...config,
        onRetry: (attempt, error) => {
          attempts = attempt;
          config.onRetry?.(attempt, error);
        },
      });

      return {
        success: true,
        result,
        attempts: attempts + 1,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        attempts: attempts + 1,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Apply jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retryable version of a function
   */
  static createRetryableFunction<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    config: Partial<RetryConfig> = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.executeWithRetry(() => fn(...args), config);
    };
  }
}

/**
 * Predefined retry configurations for common scenarios
 */
export const RetryConfigs = {
  /**
   * Configuration for LINE API calls
   */
  lineApi: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    name: 'LINE_API',
    retryableErrors: (error: any) => {
      // LINE API specific retryable errors
      if (error?.response?.status === 429) return true; // Rate limiting
      if (error?.response?.status >= 500) return true; // Server errors
      if (error?.code === 'ECONNRESET') return true;
      if (error?.code === 'ETIMEDOUT') return true;
      return false;
    },
  } as Partial<RetryConfig>,

  /**
   * Configuration for database operations
   */
  database: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    name: 'DATABASE',
    retryableErrors: (error: any) => {
      // Database specific retryable errors
      if (error?.code === 'ECONNRESET') return true;
      if (error?.code === 'ETIMEDOUT') return true;
      if (error?.message?.includes('connection')) return true;
      if (error?.message?.includes('timeout')) return true;
      return false;
    },
  } as Partial<RetryConfig>,

  /**
   * Configuration for job processing
   */
  jobProcessing: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    jitter: true,
    name: 'JOB_PROCESSING',
    retryableErrors: (error: any) => {
      // Job processing retryable errors
      if (error?.message?.includes('temporarily unavailable')) return true;
      if (error?.response?.status >= 500) return true;
      if (error?.code === 'ECONNRESET') return true;
      return false;
    },
  } as Partial<RetryConfig>,

  /**
   * Configuration for external API calls
   */
  externalApi: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitter: true,
    name: 'EXTERNAL_API',
    retryableErrors: (error: any) => {
      if (error?.response?.status === 429) return true;
      if (error?.response?.status >= 500) return true;
      if (error?.code === 'ECONNRESET') return true;
      if (error?.code === 'ETIMEDOUT') return true;
      if (error?.code === 'ENOTFOUND') return true;
      return false;
    },
  } as Partial<RetryConfig>,
};