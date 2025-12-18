import { Context, Next } from 'hono';
import { AppError } from '../core/errors/app-error.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { logger } from '../core/logging/logger.js';
import { CircuitBreakerOpenError } from '../core/resilience/circuit-breaker.js';
import { ServiceUnavailableError } from '../core/resilience/graceful-degradation.js';

export const errorMiddleware = async (c: Context, next: Next) => {
  const startTime = Date.now();
  const requestId = c.get('requestId') || 'unknown';
  const method = c.req.method;
  const path = c.req.path;
  
  try {
    await next();
    
    // Log successful requests
    const duration = Date.now() - startTime;
    logger.performance(
      `${method} ${path}`,
      duration,
      { requestId, statusCode: c.res.status }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const context = {
      requestId,
      method,
      path,
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      duration,
    };

    // Handle different error types with appropriate logging
    if (error instanceof AppError) {
      // Log operational errors at appropriate level
      if (error.statusCode >= 500) {
        logger.error('Operational error occurred', error, context);
      } else if (error.statusCode >= 400) {
        logger.warn('Client error occurred', context, {
          error: error.message,
          code: error.code,
        });
      }
      
      return ResponseBuilder.error(c, error);
    }
    
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn('Circuit breaker open', context, {
        error: error.message,
      });
      
      const circuitError = new AppError(
        'Service temporarily unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );
      
      return ResponseBuilder.error(c, circuitError);
    }
    
    if (error instanceof ServiceUnavailableError) {
      logger.warn('Service unavailable', context, {
        error: error.message,
      });
      
      const serviceError = new AppError(
        'Service temporarily unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );
      
      return ResponseBuilder.error(c, serviceError);
    }
    
    // Handle unexpected errors
    logger.error('Unexpected error occurred', error as Error, context);
    
    const unexpectedError = new AppError(
      'An unexpected error occurred',
      500,
      'INTERNAL_ERROR',
      false
    );
    
    return ResponseBuilder.error(c, unexpectedError);
  }
};