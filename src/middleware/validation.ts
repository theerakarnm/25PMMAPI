import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

// Custom zValidator wrapper that throws HTTPException instead of returning response
// This allows for consistent error handling through the error middleware
export const validateBody = <T extends z.ZodSchema>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, { 
        message: 'Validation failed',
        cause: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        }
      });
    }
  });

export const validateQuery = <T extends z.ZodSchema>(schema: T) =>
  zValidator('query', schema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, { 
        message: 'Query validation failed',
        cause: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        }
      });
    }
  });

export const validateParams = <T extends z.ZodSchema>(schema: T) =>
  zValidator('param', schema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, { 
        message: 'Parameter validation failed',
        cause: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        }
      });
    }
  });