import { Context, Next } from 'hono';
import { AppError } from '../core/errors/app-error.js';
import { ResponseBuilder } from '../core/response/response-builder.js';

export const errorMiddleware = async (c: Context, next: Next) => {
  try {
    await next();
  } catch (error) {
    console.error('Error caught by middleware:', error);
    
    if (error instanceof AppError) {
      return ResponseBuilder.error(c, error);
    }
    
    // Handle unexpected errors
    const unexpectedError = new AppError(
      'An unexpected error occurred',
      500,
      'INTERNAL_ERROR',
      false
    );
    
    return ResponseBuilder.error(c, unexpectedError);
  }
};