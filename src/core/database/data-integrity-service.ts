import { DataIntegrityService, IntegrityCheckResult } from './integrity.js';
import { DataValidationService, ValidationResult } from './validation.js';
import { DataMigrationService, MigrationResult, CleanupOptions, DataMigrationOptions } from './migration-utils.js';
import { 
  ReferentialIntegrityError, 
  ConstraintViolationError, 
  DataConsistencyError,
  InvalidStatusTransitionError 
} from '../errors/app-error.js';

export interface DataIntegrityReport {
  integrity: IntegrityCheckResult;
  validation: ValidationResult;
  migration?: MigrationResult;
  timestamp: Date;
}

export interface DataIntegrityOptions {
  validateReferentialIntegrity?: boolean;
  validateConstraints?: boolean;
  runMigrations?: boolean;
  migrationOptions?: CleanupOptions & DataMigrationOptions;
}

/**
 * Comprehensive data integrity service that combines validation, integrity checks, and migrations
 */
export class ComprehensiveDataIntegrityService {
  private integrityService: DataIntegrityService;
  private validationService: DataValidationService;
  private migrationService: DataMigrationService;

  constructor() {
    this.integrityService = new DataIntegrityService();
    this.validationService = new DataValidationService();
    this.migrationService = new DataMigrationService();
  }

  /**
   * Validate user data with comprehensive checks
   */
  async validateUser(userData: any, isUpdate: boolean = false, userId?: string): Promise<void> {
    const result = await this.validationService.validateUserData(userData, isUpdate, userId);
    
    if (!result.isValid) {
      throw new ConstraintViolationError(
        'User data validation failed',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Validate protocol data with comprehensive checks
   */
  async validateProtocol(protocolData: any, isUpdate: boolean = false, protocolId?: string): Promise<void> {
    const result = await this.validationService.validateProtocolData(protocolData, isUpdate, protocolId);
    
    if (!result.isValid) {
      throw new ConstraintViolationError(
        'Protocol data validation failed',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Validate protocol step data with comprehensive checks
   */
  async validateProtocolStep(stepData: any, protocolId?: string): Promise<void> {
    const result = await this.validationService.validateProtocolStepData(stepData, protocolId);
    
    if (!result.isValid) {
      throw new ConstraintViolationError(
        'Protocol step data validation failed',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Validate protocol assignment with referential integrity checks
   */
  async validateProtocolAssignment(userId: string, protocolId: string): Promise<void> {
    // First check referential integrity
    const integrityResult = await this.integrityService.validateProtocolAssignmentCreation(userId, protocolId);
    if (!integrityResult.isValid) {
      throw new ReferentialIntegrityError(
        'Protocol assignment referential integrity check failed',
        { errors: integrityResult.errors, warnings: integrityResult.warnings }
      );
    }

    // Then check constraints
    const constraintResult = await this.validationService.validateProtocolAssignmentConstraints(userId, protocolId);
    if (!constraintResult.isValid) {
      throw new ConstraintViolationError(
        'Protocol assignment constraint validation failed',
        { errors: constraintResult.errors, warnings: constraintResult.warnings }
      );
    }
  }

  /**
   * Validate interaction log creation with comprehensive checks
   */
  async validateInteractionLog(
    userId: string, 
    protocolId: string, 
    stepId: string, 
    assignmentId: string
  ): Promise<void> {
    const result = await this.integrityService.validateInteractionLogCreation(
      userId, 
      protocolId, 
      stepId, 
      assignmentId
    );
    
    if (!result.isValid) {
      throw new ReferentialIntegrityError(
        'Interaction log validation failed',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Validate status transition
   */
  async validateStatusTransition(
    table: 'users' | 'protocols' | 'protocol_assignments',
    id: string,
    newStatus: string
  ): Promise<void> {
    const result = await this.validationService.validateStatusTransition(table, id, newStatus);
    
    if (!result.isValid) {
      throw new InvalidStatusTransitionError(
        'Status transition validation failed',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Check if user can be safely deleted
   */
  async validateUserDeletion(userId: string): Promise<void> {
    const result = await this.integrityService.validateUserDeletion(userId);
    
    if (!result.isValid) {
      throw new ReferentialIntegrityError(
        'User cannot be deleted due to referential integrity constraints',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Check if protocol can be safely deleted
   */
  async validateProtocolDeletion(protocolId: string): Promise<void> {
    const result = await this.integrityService.validateProtocolDeletion(protocolId);
    
    if (!result.isValid) {
      throw new ReferentialIntegrityError(
        'Protocol cannot be deleted due to referential integrity constraints',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Check if admin can be safely deleted
   */
  async validateAdminDeletion(adminId: string): Promise<void> {
    const result = await this.integrityService.validateAdminDeletion(adminId);
    
    if (!result.isValid) {
      throw new ReferentialIntegrityError(
        'Admin cannot be deleted due to referential integrity constraints',
        { errors: result.errors, warnings: result.warnings }
      );
    }
  }

  /**
   * Generate comprehensive data integrity report
   */
  async generateIntegrityReport(options: DataIntegrityOptions = {}): Promise<DataIntegrityReport> {
    const {
      validateReferentialIntegrity = true,
      validateConstraints = true,
      runMigrations = false,
      migrationOptions = {}
    } = options;

    let integrity: IntegrityCheckResult = { isValid: true, errors: [], warnings: [] };
    let validation: ValidationResult = { isValid: true, errors: [], warnings: [] };
    let migration: MigrationResult | undefined;

    // Check data consistency
    if (validateReferentialIntegrity) {
      integrity = await this.integrityService.validateDataConsistency();
    }

    // Run migrations if requested
    if (runMigrations) {
      const migrationResult = await this.migrationService.runComprehensiveMigration(migrationOptions);
      migration = migrationResult.overall;
    }

    return {
      integrity,
      validation,
      migration,
      timestamp: new Date()
    };
  }

  /**
   * Fix data integrity issues automatically
   */
  async fixDataIntegrityIssues(options: CleanupOptions & DataMigrationOptions = {}): Promise<MigrationResult> {
    const migrationResult = await this.migrationService.runComprehensiveMigration(options);
    
    if (!migrationResult.overall.success) {
      throw new DataConsistencyError(
        'Failed to fix data integrity issues',
        { 
          errors: migrationResult.overall.errors,
          details: migrationResult.details
        }
      );
    }

    return migrationResult.overall;
  }

  /**
   * Clean up orphaned records
   */
  async cleanupOrphanedRecords(dryRun: boolean = true): Promise<{
    deletedCount: number;
    deletedRecords: any[];
  }> {
    return await this.integrityService.cleanupOrphanedRecords(dryRun);
  }

  /**
   * Get data consistency report
   */
  async getConsistencyReport() {
    return await this.integrityService.generateConsistencyReport();
  }

  /**
   * Recalculate adherence rates for all assignments
   */
  async recalculateAdherenceRates(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    return await this.migrationService.recalculateAdherenceRates(options);
  }

  /**
   * Clean up old interaction logs
   */
  async cleanupOldLogs(options: CleanupOptions = {}): Promise<MigrationResult> {
    return await this.migrationService.cleanupOldInteractionLogs(options);
  }

  /**
   * Clean up soft-deleted records
   */
  async cleanupSoftDeletedRecords(options: CleanupOptions = {}): Promise<MigrationResult> {
    return await this.migrationService.cleanupSoftDeletedRecords(options);
  }

  /**
   * Fix protocol step ordering
   */
  async fixProtocolStepOrdering(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    return await this.migrationService.fixProtocolStepOrdering(options);
  }

  /**
   * Fix timestamp consistency issues
   */
  async fixTimestampConsistency(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    return await this.migrationService.fixTimestampConsistency(options);
  }
}

// Export singleton instance
export const dataIntegrityService = new ComprehensiveDataIntegrityService();