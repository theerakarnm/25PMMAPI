import { eq, and, isNull, count, sql, lt, gte, inArray } from 'drizzle-orm';
import { database } from './connection.js';
import { 
  users, 
  admins, 
  protocols, 
  protocolSteps, 
  protocolAssignments, 
  interactionLogs 
} from './schema.js';
import { DatabaseError } from '../errors/app-error.js';

export interface MigrationResult {
  success: boolean;
  recordsProcessed: number;
  recordsUpdated: number;
  errors: string[];
  warnings: string[];
}

export interface CleanupOptions {
  dryRun?: boolean;
  batchSize?: number;
  olderThanDays?: number;
}

export interface DataMigrationOptions {
  batchSize?: number;
  continueOnError?: boolean;
}

export class DataMigrationService {
  private db = database;

  /**
   * Migrate old data to ensure referential integrity
   */
  async migrateReferentialIntegrity(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    const { batchSize = 1000, continueOnError = false } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      await this.db.transaction(async (tx) => {
        // Fix orphaned protocol steps
        const orphanedSteps = await tx
          .select({ id: protocolSteps.id })
          .from(protocolSteps)
          .leftJoin(protocols, eq(protocolSteps.protocolId, protocols.id))
          .where(isNull(protocols.id))
          .limit(batchSize);

        if (orphanedSteps.length > 0) {
          const stepIds = orphanedSteps.map(s => s.id);
          await tx.delete(protocolSteps).where(inArray(protocolSteps.id, stepIds));
          recordsUpdated += orphanedSteps.length;
          warnings.push(`Removed ${orphanedSteps.length} orphaned protocol steps`);
        }
        recordsProcessed += orphanedSteps.length;

        // Fix orphaned protocol assignments
        const orphanedAssignments = await tx
          .select({ id: protocolAssignments.id })
          .from(protocolAssignments)
          .leftJoin(users, eq(protocolAssignments.userId, users.id))
          .leftJoin(protocols, eq(protocolAssignments.protocolId, protocols.id))
          .where(sql`${users.id} IS NULL OR ${protocols.id} IS NULL`)
          .limit(batchSize);

        if (orphanedAssignments.length > 0) {
          const assignmentIds = orphanedAssignments.map(a => a.id);
          await tx.delete(protocolAssignments).where(inArray(protocolAssignments.id, assignmentIds));
          recordsUpdated += orphanedAssignments.length;
          warnings.push(`Removed ${orphanedAssignments.length} orphaned protocol assignments`);
        }
        recordsProcessed += orphanedAssignments.length;

        // Fix orphaned interaction logs
        const orphanedLogs = await tx
          .select({ id: interactionLogs.id })
          .from(interactionLogs)
          .leftJoin(users, eq(interactionLogs.userId, users.id))
          .leftJoin(protocols, eq(interactionLogs.protocolId, protocols.id))
          .leftJoin(protocolSteps, eq(interactionLogs.stepId, protocolSteps.id))
          .leftJoin(protocolAssignments, eq(interactionLogs.assignmentId, protocolAssignments.id))
          .where(sql`${users.id} IS NULL OR ${protocols.id} IS NULL OR ${protocolSteps.id} IS NULL OR ${protocolAssignments.id} IS NULL`)
          .limit(batchSize);

        if (orphanedLogs.length > 0) {
          const logIds = orphanedLogs.map(l => l.id);
          await tx.delete(interactionLogs).where(inArray(interactionLogs.id, logIds));
          recordsUpdated += orphanedLogs.length;
          warnings.push(`Removed ${orphanedLogs.length} orphaned interaction logs`);
        }
        recordsProcessed += orphanedLogs.length;
      });

      return {
        success: true,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      if (!continueOnError) {
        throw new DatabaseError('Migration failed', error);
      }
      
      errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    }
  }

  /**
   * Clean up old interaction logs
   */
  async cleanupOldInteractionLogs(options: CleanupOptions = {}): Promise<MigrationResult> {
    const { dryRun = true, batchSize = 1000, olderThanDays = 365 } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Find old logs
      const [oldLogsCount] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(lt(interactionLogs.sentAt, cutoffDate));

      recordsProcessed = oldLogsCount?.count || 0;

      if (recordsProcessed === 0) {
        warnings.push('No old interaction logs found to clean up');
        return {
          success: true,
          recordsProcessed: 0,
          recordsUpdated: 0,
          errors,
          warnings
        };
      }

      if (!dryRun) {
        // Delete in batches to avoid locking issues
        let deletedTotal = 0;
        while (true) {
          const result = await this.db
            .delete(interactionLogs)
            .where(lt(interactionLogs.sentAt, cutoffDate))
            .returning({ id: interactionLogs.id });

          const deletedCount = result.length;
          deletedTotal += deletedCount;

          if (deletedCount === 0 || deletedCount < batchSize) {
            break;
          }
        }
        recordsUpdated = deletedTotal;
        warnings.push(`Deleted ${deletedTotal} old interaction logs`);
      } else {
        warnings.push(`Would delete ${recordsProcessed} old interaction logs (dry run)`);
      }

      return {
        success: true,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to cleanup old interaction logs', error);
    }
  }

  /**
   * Clean up soft-deleted records
   */
  async cleanupSoftDeletedRecords(options: CleanupOptions = {}): Promise<MigrationResult> {
    const { dryRun = true, batchSize = 1000, olderThanDays = 90 } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Clean up soft-deleted users
      const [deletedUsersCount] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(
          sql`${users.deletedAt} IS NOT NULL`,
          lt(users.deletedAt, cutoffDate)
        ));

      const userCount = deletedUsersCount?.count || 0;
      recordsProcessed += userCount;

      if (userCount > 0) {
        if (!dryRun) {
          await this.db
            .delete(users)
            .where(and(
              sql`${users.deletedAt} IS NOT NULL`,
              lt(users.deletedAt, cutoffDate)
            ));
          recordsUpdated += userCount;
          warnings.push(`Permanently deleted ${userCount} soft-deleted users`);
        } else {
          warnings.push(`Would permanently delete ${userCount} soft-deleted users (dry run)`);
        }
      }

      // Clean up soft-deleted protocols
      const [deletedProtocolsCount] = await this.db
        .select({ count: count() })
        .from(protocols)
        .where(and(
          sql`${protocols.deletedAt} IS NOT NULL`,
          lt(protocols.deletedAt, cutoffDate)
        ));

      const protocolCount = deletedProtocolsCount?.count || 0;
      recordsProcessed += protocolCount;

      if (protocolCount > 0) {
        if (!dryRun) {
          // First delete associated steps (cascade should handle this, but being explicit)
          await this.db
            .delete(protocolSteps)
            .where(
              inArray(
                protocolSteps.protocolId,
                this.db
                  .select({ id: protocols.id })
                  .from(protocols)
                  .where(and(
                    sql`${protocols.deletedAt} IS NOT NULL`,
                    lt(protocols.deletedAt, cutoffDate)
                  ))
              )
            );

          await this.db
            .delete(protocols)
            .where(and(
              sql`${protocols.deletedAt} IS NOT NULL`,
              lt(protocols.deletedAt, cutoffDate)
            ));
          recordsUpdated += protocolCount;
          warnings.push(`Permanently deleted ${protocolCount} soft-deleted protocols`);
        } else {
          warnings.push(`Would permanently delete ${protocolCount} soft-deleted protocols (dry run)`);
        }
      }

      // Clean up soft-deleted admins
      const [deletedAdminsCount] = await this.db
        .select({ count: count() })
        .from(admins)
        .where(and(
          sql`${admins.deletedAt} IS NOT NULL`,
          lt(admins.deletedAt, cutoffDate)
        ));

      const adminCount = deletedAdminsCount?.count || 0;
      recordsProcessed += adminCount;

      if (adminCount > 0) {
        if (!dryRun) {
          await this.db
            .delete(admins)
            .where(and(
              sql`${admins.deletedAt} IS NOT NULL`,
              lt(admins.deletedAt, cutoffDate)
            ));
          recordsUpdated += adminCount;
          warnings.push(`Permanently deleted ${adminCount} soft-deleted admins`);
        } else {
          warnings.push(`Would permanently delete ${adminCount} soft-deleted admins (dry run)`);
        }
      }

      return {
        success: true,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to cleanup soft-deleted records', error);
    }
  }

  /**
   * Update adherence rates for all protocol assignments
   */
  async recalculateAdherenceRates(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    const { batchSize = 100, continueOnError = true } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      // Get all active and completed assignments
      const assignments = await this.db
        .select({
          id: protocolAssignments.id,
          userId: protocolAssignments.userId,
          protocolId: protocolAssignments.protocolId
        })
        .from(protocolAssignments)
        .where(inArray(protocolAssignments.status, ['active', 'completed']))
        .limit(batchSize);

      recordsProcessed = assignments.length;

      for (const assignment of assignments) {
        try {
          // Count total messages sent for this assignment
          const [totalSent] = await this.db
            .select({ count: count() })
            .from(interactionLogs)
            .where(eq(interactionLogs.assignmentId, assignment.id));

          // Count responded messages
          const [totalResponded] = await this.db
            .select({ count: count() })
            .from(interactionLogs)
            .where(and(
              eq(interactionLogs.assignmentId, assignment.id),
              eq(interactionLogs.status, 'responded')
            ));

          const sentCount = totalSent?.count || 0;
          const respondedCount = totalResponded?.count || 0;
          const adherenceRate = sentCount > 0 ? ((respondedCount / sentCount) * 100).toFixed(2) : '0.00';

          // Update the assignment
          await this.db
            .update(protocolAssignments)
            .set({
              adherenceRate,
              completedSteps: respondedCount,
              totalSteps: sentCount,
              updatedAt: new Date()
            })
            .where(eq(protocolAssignments.id, assignment.id));

          recordsUpdated++;
        } catch (error) {
          const errorMsg = `Failed to update adherence rate for assignment ${assignment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          
          if (!continueOnError) {
            throw new DatabaseError(errorMsg, error);
          }
        }
      }

      if (recordsUpdated > 0) {
        warnings.push(`Updated adherence rates for ${recordsUpdated} protocol assignments`);
      }

      return {
        success: errors.length === 0,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to recalculate adherence rates', error);
    }
  }

  /**
   * Fix inconsistent protocol step ordering
   */
  async fixProtocolStepOrdering(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    const { batchSize = 50, continueOnError = true } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      // Get all protocols with steps
      const protocolResult = await this.db
        .select({ id: protocols.id })
        .from(protocols)
        .where(isNull(protocols.deletedAt))
        .limit(batchSize);

      recordsProcessed = protocolResult.length;

      for (const protocol of protocolResult) {
        try {
          // Get all steps for this protocol ordered by step_order
          const steps = await this.db
            .select({
              id: protocolSteps.id,
              stepOrder: protocolSteps.stepOrder
            })
            .from(protocolSteps)
            .where(eq(protocolSteps.protocolId, protocol.id))
            .orderBy(sql`CAST(${protocolSteps.stepOrder} AS INTEGER) ASC`);

          // Check if step ordering is sequential starting from 1
          let needsReordering = false;
          for (let i = 0; i < steps.length; i++) {
            const expectedOrder = (i + 1).toString();
            if (steps[i].stepOrder !== expectedOrder) {
              needsReordering = true;
              break;
            }
          }

          if (needsReordering) {
            // Reorder steps sequentially
            await this.db.transaction(async (tx) => {
              for (let i = 0; i < steps.length; i++) {
                const newOrder = (i + 1).toString();
                await tx
                  .update(protocolSteps)
                  .set({
                    stepOrder: newOrder,
                    updatedAt: new Date()
                  })
                  .where(eq(protocolSteps.id, steps[i].id));
              }
            });

            recordsUpdated++;
            warnings.push(`Fixed step ordering for protocol ${protocol.id} (${steps.length} steps)`);
          }
        } catch (error) {
          const errorMsg = `Failed to fix step ordering for protocol ${protocol.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          
          if (!continueOnError) {
            throw new DatabaseError(errorMsg, error);
          }
        }
      }

      return {
        success: errors.length === 0,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to fix protocol step ordering', error);
    }
  }

  /**
   * Validate and fix timestamp consistency
   */
  async fixTimestampConsistency(options: DataMigrationOptions = {}): Promise<MigrationResult> {
    const { batchSize = 1000, continueOnError = true } = options;
    const errors: string[] = [];
    const warnings: string[] = [];
    let recordsProcessed = 0;
    let recordsUpdated = 0;

    try {
      // Fix interaction logs where respondedAt is before sentAt
      const invalidLogs = await this.db
        .select({
          id: interactionLogs.id,
          sentAt: interactionLogs.sentAt,
          respondedAt: interactionLogs.respondedAt
        })
        .from(interactionLogs)
        .where(sql`${interactionLogs.respondedAt} < ${interactionLogs.sentAt}`)
        .limit(batchSize);

      recordsProcessed += invalidLogs.length;

      if (invalidLogs.length > 0) {
        for (const log of invalidLogs) {
          try {
            // Set respondedAt to sentAt + 1 minute as a reasonable default
            const fixedRespondedAt = new Date(log.sentAt.getTime() + 60000);
            const timeDifferenceMs = fixedRespondedAt.getTime() - log.sentAt.getTime();

            await this.db
              .update(interactionLogs)
              .set({
                respondedAt: fixedRespondedAt,
                timeDifferenceMs
              })
              .where(eq(interactionLogs.id, log.id));

            recordsUpdated++;
          } catch (error) {
            const errorMsg = `Failed to fix timestamp for log ${log.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            
            if (!continueOnError) {
              throw new DatabaseError(errorMsg, error);
            }
          }
        }

        warnings.push(`Fixed ${recordsUpdated} interaction logs with invalid timestamps`);
      }

      // Fix protocol assignments where completedAt is before startedAt
      const invalidAssignments = await this.db
        .select({
          id: protocolAssignments.id,
          startedAt: protocolAssignments.startedAt,
          completedAt: protocolAssignments.completedAt
        })
        .from(protocolAssignments)
        .where(sql`${protocolAssignments.completedAt} < ${protocolAssignments.startedAt}`)
        .limit(batchSize);

      recordsProcessed += invalidAssignments.length;

      if (invalidAssignments.length > 0) {
        for (const assignment of invalidAssignments) {
          try {
            // Set completedAt to startedAt + 1 day as a reasonable default
            const fixedCompletedAt = assignment.startedAt ? 
              new Date(assignment.startedAt.getTime() + 86400000) : 
              new Date();

            await this.db
              .update(protocolAssignments)
              .set({
                completedAt: fixedCompletedAt,
                updatedAt: new Date()
              })
              .where(eq(protocolAssignments.id, assignment.id));

            recordsUpdated++;
          } catch (error) {
            const errorMsg = `Failed to fix timestamp for assignment ${assignment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            
            if (!continueOnError) {
              throw new DatabaseError(errorMsg, error);
            }
          }
        }

        warnings.push(`Fixed ${invalidAssignments.length} protocol assignments with invalid timestamps`);
      }

      return {
        success: errors.length === 0,
        recordsProcessed,
        recordsUpdated,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to fix timestamp consistency', error);
    }
  }

  /**
   * Run comprehensive data migration and cleanup
   */
  async runComprehensiveMigration(options: CleanupOptions & DataMigrationOptions = {}): Promise<{
    overall: MigrationResult;
    details: Record<string, MigrationResult>;
  }> {
    const results: Record<string, MigrationResult> = {};
    const overallErrors: string[] = [];
    const overallWarnings: string[] = [];
    let totalProcessed = 0;
    let totalUpdated = 0;

    try {
      // 1. Fix referential integrity
      results.referentialIntegrity = await this.migrateReferentialIntegrity(options);
      totalProcessed += results.referentialIntegrity.recordsProcessed;
      totalUpdated += results.referentialIntegrity.recordsUpdated;
      overallErrors.push(...results.referentialIntegrity.errors);
      overallWarnings.push(...results.referentialIntegrity.warnings);

      // 2. Fix protocol step ordering
      results.stepOrdering = await this.fixProtocolStepOrdering(options);
      totalProcessed += results.stepOrdering.recordsProcessed;
      totalUpdated += results.stepOrdering.recordsUpdated;
      overallErrors.push(...results.stepOrdering.errors);
      overallWarnings.push(...results.stepOrdering.warnings);

      // 3. Fix timestamp consistency
      results.timestampConsistency = await this.fixTimestampConsistency(options);
      totalProcessed += results.timestampConsistency.recordsProcessed;
      totalUpdated += results.timestampConsistency.recordsUpdated;
      overallErrors.push(...results.timestampConsistency.errors);
      overallWarnings.push(...results.timestampConsistency.warnings);

      // 4. Recalculate adherence rates
      results.adherenceRates = await this.recalculateAdherenceRates(options);
      totalProcessed += results.adherenceRates.recordsProcessed;
      totalUpdated += results.adherenceRates.recordsUpdated;
      overallErrors.push(...results.adherenceRates.errors);
      overallWarnings.push(...results.adherenceRates.warnings);

      // 5. Cleanup old data (if not dry run)
      if (!options.dryRun) {
        results.oldLogs = await this.cleanupOldInteractionLogs(options);
        totalProcessed += results.oldLogs.recordsProcessed;
        totalUpdated += results.oldLogs.recordsUpdated;
        overallErrors.push(...results.oldLogs.errors);
        overallWarnings.push(...results.oldLogs.warnings);

        results.softDeleted = await this.cleanupSoftDeletedRecords(options);
        totalProcessed += results.softDeleted.recordsProcessed;
        totalUpdated += results.softDeleted.recordsUpdated;
        overallErrors.push(...results.softDeleted.errors);
        overallWarnings.push(...results.softDeleted.warnings);
      }

      const overall: MigrationResult = {
        success: overallErrors.length === 0,
        recordsProcessed: totalProcessed,
        recordsUpdated: totalUpdated,
        errors: overallErrors,
        warnings: overallWarnings
      };

      return { overall, details: results };
    } catch (error) {
      throw new DatabaseError('Comprehensive migration failed', error);
    }
  }
}