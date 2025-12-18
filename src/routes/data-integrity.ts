import { Hono } from 'hono';
import { z } from 'zod';
import { dataIntegrityService } from '../core/database/data-integrity-service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { AppError } from '../core/errors/app-error.js';

const dataIntegrity = new Hono();

// Apply authentication middleware to all routes
dataIntegrity.use('*', authMiddleware);

// Validation schemas
const IntegrityReportQuerySchema = z.object({
  validateReferentialIntegrity: z.string().transform(val => val === 'true').optional(),
  validateConstraints: z.string().transform(val => val === 'true').optional(),
  runMigrations: z.string().transform(val => val === 'true').optional(),
  dryRun: z.string().transform(val => val === 'true').optional(),
});

const CleanupOptionsSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  batchSize: z.number().int().min(1).max(10000).optional().default(1000),
  olderThanDays: z.number().int().min(1).max(3650).optional().default(365),
});

const MigrationOptionsSchema = z.object({
  batchSize: z.number().int().min(1).max(10000).optional().default(1000),
  continueOnError: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(true),
});

const ValidationRequestSchema = z.object({
  table: z.enum(['users', 'protocols', 'protocol_assignments']),
  id: z.string().uuid(),
  newStatus: z.string().min(1),
});

/**
 * GET /api/data-integrity/report
 * Generate comprehensive data integrity report
 */
dataIntegrity.get('/report', 
  validateQuery(IntegrityReportQuerySchema),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const report = await dataIntegrityService.generateIntegrityReport({
        validateReferentialIntegrity: query.validateReferentialIntegrity ?? true,
        validateConstraints: query.validateConstraints ?? true,
        runMigrations: query.runMigrations ?? false,
        migrationOptions: {
          dryRun: query.dryRun ?? true
        }
      });

      return ResponseBuilder.success(c, {
        message: 'Data integrity report generated successfully',
        data: report
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to generate integrity report');
    }
  }
);

/**
 * GET /api/data-integrity/consistency-report
 * Get detailed data consistency report
 */
dataIntegrity.get('/consistency-report', async (c) => {
  try {
    const report = await dataIntegrityService.getConsistencyReport();

    return ResponseBuilder.success(c, {
      message: 'Data consistency report generated successfully',
      data: report
    });
  } catch (error) {
    if (error instanceof AppError) {
      return ResponseBuilder.error(c, error, error.statusCode);
    }
    return ResponseBuilder.internalError(c, 'Failed to generate consistency report');
  }
});

/**
 * POST /api/data-integrity/fix-issues
 * Fix data integrity issues automatically
 */
dataIntegrity.post('/fix-issues',
  validateBody(MigrationOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.fixDataIntegrityIssues(options);

      return ResponseBuilder.success(c, {
        message: 'Data integrity issues fixed successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to fix data integrity issues');
    }
  }
);

/**
 * POST /api/data-integrity/cleanup-orphaned
 * Clean up orphaned records
 */
dataIntegrity.post('/cleanup-orphaned',
  validateBody(z.object({ dryRun: z.boolean().optional().default(true) })),
  async (c) => {
    try {
      const { dryRun } = c.req.valid('json');
      
      const result = await dataIntegrityService.cleanupOrphanedRecords(dryRun);

      return ResponseBuilder.success(c, {
        message: dryRun ? 'Orphaned records analysis completed' : 'Orphaned records cleaned up successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to cleanup orphaned records');
    }
  }
);

/**
 * POST /api/data-integrity/recalculate-adherence
 * Recalculate adherence rates for all protocol assignments
 */
dataIntegrity.post('/recalculate-adherence',
  validateBody(MigrationOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.recalculateAdherenceRates(options);

      return ResponseBuilder.success(c, {
        message: 'Adherence rates recalculated successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to recalculate adherence rates');
    }
  }
);

/**
 * POST /api/data-integrity/cleanup-old-logs
 * Clean up old interaction logs
 */
dataIntegrity.post('/cleanup-old-logs',
  validateBody(CleanupOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.cleanupOldLogs(options);

      return ResponseBuilder.success(c, {
        message: options.dryRun ? 'Old logs analysis completed' : 'Old logs cleaned up successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to cleanup old logs');
    }
  }
);

/**
 * POST /api/data-integrity/cleanup-soft-deleted
 * Clean up soft-deleted records
 */
dataIntegrity.post('/cleanup-soft-deleted',
  validateBody(CleanupOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.cleanupSoftDeletedRecords(options);

      return ResponseBuilder.success(c, {
        message: options.dryRun ? 'Soft-deleted records analysis completed' : 'Soft-deleted records cleaned up successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to cleanup soft-deleted records');
    }
  }
);

/**
 * POST /api/data-integrity/fix-step-ordering
 * Fix protocol step ordering issues
 */
dataIntegrity.post('/fix-step-ordering',
  validateBody(MigrationOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.fixProtocolStepOrdering(options);

      return ResponseBuilder.success(c, {
        message: 'Protocol step ordering fixed successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to fix protocol step ordering');
    }
  }
);

/**
 * POST /api/data-integrity/fix-timestamps
 * Fix timestamp consistency issues
 */
dataIntegrity.post('/fix-timestamps',
  validateBody(MigrationOptionsSchema),
  async (c) => {
    try {
      const options = c.req.valid('json');
      
      const result = await dataIntegrityService.fixTimestampConsistency(options);

      return ResponseBuilder.success(c, {
        message: 'Timestamp consistency fixed successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to fix timestamp consistency');
    }
  }
);

/**
 * POST /api/data-integrity/validate-status-transition
 * Validate status transition before applying
 */
dataIntegrity.post('/validate-status-transition',
  validateBody(ValidationRequestSchema),
  async (c) => {
    try {
      const { table, id, newStatus } = c.req.valid('json');
      
      await dataIntegrityService.validateStatusTransition(table, id, newStatus);

      return ResponseBuilder.success(c, {
        message: 'Status transition is valid',
        data: { valid: true }
      });
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error, error.statusCode);
      }
      return ResponseBuilder.internalError(c, 'Failed to validate status transition');
    }
  }
);

/**
 * POST /api/data-integrity/validate-user-deletion/:id
 * Validate if user can be safely deleted
 */
dataIntegrity.post('/validate-user-deletion/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    
    await dataIntegrityService.validateUserDeletion(userId);

    return ResponseBuilder.success(c, {
      message: 'User can be safely deleted',
      data: { canDelete: true }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return ResponseBuilder.error(c, error, error.statusCode);
    }
    return ResponseBuilder.internalError(c, 'Failed to validate user deletion');
  }
});

/**
 * POST /api/data-integrity/validate-protocol-deletion/:id
 * Validate if protocol can be safely deleted
 */
dataIntegrity.post('/validate-protocol-deletion/:id', async (c) => {
  try {
    const protocolId = c.req.param('id');
    
    await dataIntegrityService.validateProtocolDeletion(protocolId);

    return ResponseBuilder.success(c, {
      message: 'Protocol can be safely deleted',
      data: { canDelete: true }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return ResponseBuilder.error(c, error, error.statusCode);
    }
    return ResponseBuilder.internalError(c, 'Failed to validate protocol deletion');
  }
});

/**
 * POST /api/data-integrity/validate-admin-deletion/:id
 * Validate if admin can be safely deleted
 */
dataIntegrity.post('/validate-admin-deletion/:id', async (c) => {
  try {
    const adminId = c.req.param('id');
    
    await dataIntegrityService.validateAdminDeletion(adminId);

    return ResponseBuilder.success(c, {
      message: 'Admin can be safely deleted',
      data: { canDelete: true }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return ResponseBuilder.error(c, error, error.statusCode);
    }
    return ResponseBuilder.internalError(c, 'Failed to validate admin deletion');
  }
});

export { dataIntegrity };