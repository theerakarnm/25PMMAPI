import { Context } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../errors/app-error.js';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

export class ResponseBuilder {
  static success<T>(c: Context, data: T, statusCode: ContentfulStatusCode = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };

    return c.json(response, statusCode);
  }

  static error(c: Context, error: AppError | Error, statusCode?: ContentfulStatusCode): Response {
    const isAppError = error instanceof AppError;
    const code = isAppError ? error.code : 'INTERNAL_ERROR';
    const status = statusCode || (isAppError ? error.statusCode as ContentfulStatusCode : 500);
    const details = isAppError ? error.details : undefined;

    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message: error.message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4(),
      },
    };

    return c.json(response, status);
  }

  static created<T>(c: Context, data: T): Response {
    return this.success(c, data, 201);
  }

  static noContent(c: Context): Response {
    return c.body(null, 204);
  }

  static badRequest(c: Context, message: string, details?: any): Response {
    return this.error(c, new AppError(message, 400, 'BAD_REQUEST', true, details));
  }

  static unauthorized(c: Context, message: string = 'Unauthorized'): Response {
    return this.error(c, new AppError(message, 401, 'UNAUTHORIZED'));
  }

  static forbidden(c: Context, message: string = 'Forbidden'): Response {
    return this.error(c, new AppError(message, 403, 'FORBIDDEN'));
  }

  static notFound(c: Context, message: string = 'Resource not found'): Response {
    return this.error(c, new AppError(message, 404, 'NOT_FOUND'));
  }

  static internalError(c: Context, message: string = 'Internal server error'): Response {
    return this.error(c, new AppError(message, 500, 'INTERNAL_ERROR'));
  }
}