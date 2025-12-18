export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
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