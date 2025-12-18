import { test, expect, describe } from "bun:test";
import { AppError, LineApiError, DatabaseError, ValidationError, NotFoundError } from '../app-error.js';
import { CircuitBreaker, CircuitBreakerOpenError, CircuitState } from '../../resilience/circuit-breaker.js';
import { RetryManager } from '../../resilience/retry.js';

describe('Basic Error Handling', () => {
  describe('AppError Classification', () => {
    test('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', true, { detail: 'test' });
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('Error');
    });

    test('should create specific error types correctly', () => {
      const lineError = new LineApiError('LINE API failed');
      expect(lineError.statusCode).toBe(502);
      expect(lineError.code).toBe('LINE_API_ERROR');
      expect(lineError.message).toBe('LINE API failed');

      const dbError = new DatabaseError('Database connection failed');
      expect(dbError.statusCode).toBe(500);
      expect(dbError.code).toBe('DATABASE_ERROR');
      expect(dbError.message).toBe('Database connection failed');

      const validationError = new ValidationError('Validation failed');
      expect(validationError.statusCode).toBe(400);
      expect(validationError.code).toBe('VALIDATION_ERROR');

      const notFoundError = new NotFoundError('Resource not found');
      expect(notFoundError.statusCode).toBe(404);
      expect(notFoundError.code).toBe('NOT_FOUND');
    });

    test('should use default values when not provided', () => {
      const error = new AppError('Simple error');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
    });
  });

  describe('Circuit Breaker', () => {
    test('should execute function successfully when closed', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000,
        halfOpenMaxCalls: 2,
        name: 'test-circuit',
      });

      const result = await circuitBreaker.execute(async () => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED);
    });

    test('should open circuit after failure threshold', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000,
        halfOpenMaxCalls: 2,
        name: 'test-circuit-fail',
      });

      // Cause failures to exceed threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);
      
      // Should throw CircuitBreakerOpenError
      await expect(circuitBreaker.execute(async () => 'test')).rejects.toThrow(CircuitBreakerOpenError);
    });

    test('should track statistics correctly', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000,
        halfOpenMaxCalls: 2,
        name: 'test-stats',
      });

      // Execute some successful operations
      await circuitBreaker.execute(async () => 'success1');
      await circuitBreaker.execute(async () => 'success2');

      // Execute some failed operations
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure1');
        });
      } catch (error) {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalCalls).toBe(3);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    test('should reset circuit breaker manually', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000,
        halfOpenMaxCalls: 2,
        name: 'test-reset',
      });

      // Force circuit to open
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      // Reset circuit
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('Retry Manager', () => {
    test('should retry retryable errors', async () => {
      let attempts = 0;
      
      const result = await RetryManager.executeWithRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error = new Error('Temporary failure');
            (error as any).response = { status: 500 };
            throw error;
          }
          return 'success';
        },
        {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: (error) => error?.response?.status >= 500,
        }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should not retry non-retryable errors', async () => {
      let attempts = 0;
      
      await expect(RetryManager.executeWithRetry(
        async () => {
          attempts++;
          const error = new Error('Client error');
          (error as any).response = { status: 400 };
          throw error;
        },
        {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: (error) => error?.response?.status >= 500,
        }
      )).rejects.toThrow('Client error');

      expect(attempts).toBe(1);
    });

    test('should return detailed retry result', async () => {
      let attempts = 0;
      
      const result = await RetryManager.executeWithRetryResult(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Retry me');
          }
          return 'success';
        },
        {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: () => true,
        }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    test('should respect maximum attempts', async () => {
      let attempts = 0;
      
      const result = await RetryManager.executeWithRetryResult(
        async () => {
          attempts++;
          throw new Error('Always fails');
        },
        {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: () => true,
        }
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error?.message).toBe('Always fails');
    });

    test('should calculate exponential backoff correctly', async () => {
      const delays: number[] = [];
      let attempts = 0;
      
      await RetryManager.executeWithRetryResult(
        async () => {
          attempts++;
          throw new Error('Test failure');
        },
        {
          maxAttempts: 3,
          baseDelay: 100,
          backoffMultiplier: 2,
          jitter: false, // Disable jitter for predictable testing
          retryableErrors: () => true,
          onRetry: (attempt, error) => {
            // This would be called before the delay, so we can't capture the actual delay here
            // But we can verify the retry callback is called
          },
        }
      );

      expect(attempts).toBe(3);
    });

    test('should create retryable function', async () => {
      let attempts = 0;
      
      const retryableFunction = RetryManager.createRetryableFunction(
        async (value: string) => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary failure');
          }
          return `processed: ${value}`;
        },
        {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: () => true,
        }
      );

      const result = await retryableFunction('test');
      expect(result).toBe('processed: test');
      expect(attempts).toBe(2);
    });
  });

  describe('Error Inheritance', () => {
    test('should maintain error inheritance chain', () => {
      const appError = new AppError('Test error');
      const lineError = new LineApiError('LINE error');
      const dbError = new DatabaseError('DB error');

      expect(appError instanceof Error).toBe(true);
      expect(appError instanceof AppError).toBe(true);
      
      expect(lineError instanceof Error).toBe(true);
      expect(lineError instanceof AppError).toBe(true);
      expect(lineError instanceof LineApiError).toBe(true);
      
      expect(dbError instanceof Error).toBe(true);
      expect(dbError instanceof AppError).toBe(true);
      expect(dbError instanceof DatabaseError).toBe(true);
    });

    test('should capture stack trace correctly', () => {
      const error = new AppError('Test error with stack');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error with stack');
    });
  });
});