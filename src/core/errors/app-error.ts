import { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  public readonly statusCode: ContentfulStatusCode;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: ContentfulStatusCode = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication Errors
export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'INVALID_CREDENTIALS');
  }
}

export class SessionExpiredError extends AppError {
  constructor(message: string = 'Session has expired') {
    super(message, 401, 'SESSION_EXPIRED');
  }
}

export class UnauthorizedAccessError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 403, 'UNAUTHORIZED_ACCESS');
  }
}

// Validation Errors
export class InvalidProtocolDataError extends AppError {
  constructor(message: string = 'Invalid protocol data', details?: any) {
    super(message, 400, 'INVALID_PROTOCOL_DATA', true, details);
  }
}

export class InvalidSchedulingError extends AppError {
  constructor(message: string = 'Invalid scheduling configuration', details?: any) {
    super(message, 400, 'INVALID_SCHEDULING', true, details);
  }
}

export class InvalidContentTypeError extends AppError {
  constructor(message: string = 'Invalid content type', details?: any) {
    super(message, 400, 'INVALID_CONTENT_TYPE', true, details);
  }
}

// Integration Errors
export class LineApiError extends AppError {
  constructor(message: string = 'LINE API error', details?: any) {
    super(message, 502, 'LINE_API_ERROR', true, details);
  }
}

export class WebhookValidationError extends AppError {
  constructor(message: string = 'Invalid webhook payload', details?: any) {
    super(message, 400, 'WEBHOOK_VALIDATION_ERROR', true, details);
  }
}

export class MessageDeliveryError extends AppError {
  constructor(message: string = 'Message delivery failed', details?: any) {
    super(message, 502, 'MESSAGE_DELIVERY_ERROR', true, details);
  }
}

// System Errors
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super(message, 500, 'DATABASE_ERROR', true, details);
  }
}

export class JobSchedulingError extends AppError {
  constructor(message: string = 'Job scheduling failed', details?: any) {
    super(message, 500, 'JOB_SCHEDULING_ERROR', true, details);
  }
}

export class FileStorageError extends AppError {
  constructor(message: string = 'File storage operation failed', details?: any) {
    super(message, 500, 'FILE_STORAGE_ERROR', true, details);
  }
}

// Additional Error Classes
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

// Data Integrity Errors
export class ReferentialIntegrityError extends AppError {
  constructor(message: string = 'Referential integrity violation', details?: any) {
    super(message, 400, 'REFERENTIAL_INTEGRITY_ERROR', true, details);
  }
}

export class ConstraintViolationError extends AppError {
  constructor(message: string = 'Database constraint violation', details?: any) {
    super(message, 400, 'CONSTRAINT_VIOLATION_ERROR', true, details);
  }
}

export class DataConsistencyError extends AppError {
  constructor(message: string = 'Data consistency violation', details?: any) {
    super(message, 400, 'DATA_CONSISTENCY_ERROR', true, details);
  }
}

export class OrphanedRecordError extends AppError {
  constructor(message: string = 'Orphaned record detected', details?: any) {
    super(message, 400, 'ORPHANED_RECORD_ERROR', true, details);
  }
}

export class InvalidStatusTransitionError extends AppError {
  constructor(message: string = 'Invalid status transition', details?: any) {
    super(message, 400, 'INVALID_STATUS_TRANSITION_ERROR', true, details);
  }
}