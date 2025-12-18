import { env } from '../config/env.js';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogContext {
  userId?: string;
  protocolId?: string;
  stepId?: string;
  assignmentId?: string;
  requestId?: string;
  sessionId?: string;
  lineUserId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    statusCode?: number;
  };
  performance?: {
    duration: number;
    operation: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Comprehensive logging system for debugging, monitoring, and audit trails
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private logBuffer: LogEntry[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;

  private constructor() {
    this.logLevel = this.parseLogLevel(env.LOG_LEVEL || 'INFO');
    this.enableConsole = env.NODE_ENV !== 'test';
    this.enableFile = env.ENABLE_FILE_LOGGING;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
    performance?: { duration: number; operation: string },
    metadata?: Record<string, any>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context) {
      entry.context = { ...context };
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        statusCode: (error as any).statusCode,
      };
    }

    if (performance) {
      entry.performance = performance;
    }

    if (metadata) {
      entry.metadata = metadata;
    }

    return entry;
  }

  private writeLog(entry: LogEntry): void {
    // Add to buffer for potential file writing or external logging
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer.shift(); // Remove oldest entry
    }

    if (this.enableConsole) {
      this.writeToConsole(entry);
    }

    // Future: Add file logging, external logging services, etc.
  }

  private writeToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context ? ` [${JSON.stringify(entry.context)}]` : '';
    const errorStr = entry.error ? ` ERROR: ${entry.error.message}` : '';
    const perfStr = entry.performance ? ` (${entry.performance.duration}ms)` : '';
    
    const logMessage = `[${entry.timestamp}] ${levelName}${contextStr}: ${entry.message}${errorStr}${perfStr}`;

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        if (entry.error?.stack) {
          console.error(entry.error.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
    }
  }

  /**
   * Log error messages with full context
   */
  error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, context, error, undefined, metadata);
      this.writeLog(entry);
    }
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, context, undefined, undefined, metadata);
      this.writeLog(entry);
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, context, undefined, undefined, metadata);
      this.writeLog(entry);
    }
  }

  /**
   * Log debug messages
   */
  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, context, undefined, undefined, metadata);
      this.writeLog(entry);
    }
  }

  /**
   * Log performance metrics
   */
  performance(
    operation: string,
    duration: number,
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(
        LogLevel.INFO,
        `Performance: ${operation}`,
        context,
        undefined,
        { duration, operation },
        metadata
      );
      this.writeLog(entry);
    }
  }

  /**
   * Log authentication events
   */
  auth(event: string, context: LogContext, success: boolean = true): void {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    const message = `Auth: ${event} ${success ? 'succeeded' : 'failed'}`;
    
    if (this.shouldLog(level)) {
      const entry = this.createLogEntry(level, message, context);
      this.writeLog(entry);
    }
  }

  /**
   * Log LINE API interactions
   */
  lineApi(
    operation: string,
    userId: string,
    success: boolean = true,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `LINE API: ${operation} ${success ? 'succeeded' : 'failed'}`;
    const context: LogContext = { lineUserId: userId };
    
    if (this.shouldLog(level)) {
      const entry = this.createLogEntry(level, message, context, error, undefined, metadata);
      this.writeLog(entry);
    }
  }

  /**
   * Log database operations
   */
  database(
    operation: string,
    table: string,
    success: boolean = true,
    error?: Error,
    context?: LogContext
  ): void {
    const level = success ? LogLevel.DEBUG : LogLevel.ERROR;
    const message = `Database: ${operation} on ${table} ${success ? 'succeeded' : 'failed'}`;
    
    if (this.shouldLog(level)) {
      const entry = this.createLogEntry(level, message, context, error);
      this.writeLog(entry);
    }
  }

  /**
   * Log job queue operations
   */
  job(
    jobType: string,
    jobId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying',
    context?: LogContext,
    error?: Error
  ): void {
    const level = status === 'failed' ? LogLevel.ERROR : LogLevel.INFO;
    const message = `Job: ${jobType} (${jobId}) ${status}`;
    
    if (this.shouldLog(level)) {
      const entry = this.createLogEntry(level, message, context, error);
      this.writeLog(entry);
    }
  }

  /**
   * Get recent log entries for debugging
   */
  getRecentLogs(count: number = 100, level?: LogLevel): LogEntry[] {
    let logs = this.logBuffer.slice(-count);
    
    if (level !== undefined) {
      logs = logs.filter(log => log.level <= level);
    }
    
    return logs.reverse(); // Most recent first
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * Create a child logger with default context
   */
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger that automatically includes context
 */
export class ChildLogger {
  constructor(
    private parent: Logger,
    private defaultContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void {
    this.parent.error(message, error, this.mergeContext(context), metadata);
  }

  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.parent.warn(message, this.mergeContext(context), metadata);
  }

  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.parent.info(message, this.mergeContext(context), metadata);
  }

  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.parent.debug(message, this.mergeContext(context), metadata);
  }

  performance(operation: string, duration: number, context?: LogContext, metadata?: Record<string, any>): void {
    this.parent.performance(operation, duration, this.mergeContext(context), metadata);
  }

  auth(event: string, success: boolean = true, context?: LogContext): void {
    this.parent.auth(event, this.mergeContext(context), success);
  }

  lineApi(operation: string, userId: string, success: boolean = true, error?: Error, metadata?: Record<string, any>): void {
    this.parent.lineApi(operation, userId, success, error, metadata);
  }

  database(operation: string, table: string, success: boolean = true, error?: Error, context?: LogContext): void {
    this.parent.database(operation, table, success, error, this.mergeContext(context));
  }

  job(jobType: string, jobId: string, status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying', context?: LogContext, error?: Error): void {
    this.parent.job(jobType, jobId, status, this.mergeContext(context), error);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();