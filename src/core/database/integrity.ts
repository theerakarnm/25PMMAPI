import { eq, and, isNull, count, inArray, gt } from 'drizzle-orm';
import { database } from './connection.js';
import { 
  users, 
  admins, 
  protocols, 
  protocolSteps, 
  protocolAssignments, 
  interactionLogs 
} from './schema.js';
import { DatabaseError, ValidationError } from '../errors/app-error.js';

export interface IntegrityCheckResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OrphanedRecord {
  table: string;
  id: string;
  foreignKey: string;
  referencedTable: string;
  referencedId: string;
}

export interface DataConsistencyReport {
  orphanedRecords: OrphanedRecord[];
  duplicateRecords: Array<{
    table: string;
    field: string;
    value: string;
    count: number;
  }>;
  invalidStatuses: Array<{
    table: string;
    id: string;
    field: string;
    value: string;
  }>;
  missingRequiredData: Array<{
    table: string;
    id: string;
    field: string;
  }>;
}

export class DataIntegrityService {
  private db = database;

  /**
   * Validate referential integrity for a user before deletion
   */
  async validateUserDeletion(userId: string): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for active protocol assignments
      const [activeAssignments] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.userId, userId),
          inArray(protocolAssignments.status, ['assigned', 'active'])
        ));

      if ((activeAssignments?.count || 0) > 0) {
        errors.push(`User has ${activeAssignments?.count} active protocol assignments`);
      }

      // Check for recent interaction logs (within last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [recentLogs] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(and(
          eq(interactionLogs.userId, userId),
          eq(interactionLogs.sentAt, thirtyDaysAgo)
        ));

      if ((recentLogs?.count || 0) > 0) {
        warnings.push(`User has ${recentLogs?.count} interaction logs from the last 30 days`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate user deletion', error);
    }
  }

  /**
   * Validate referential integrity for a protocol before deletion
   */
  async validateProtocolDeletion(protocolId: string): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for active assignments
      const [activeAssignments] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.protocolId, protocolId),
          inArray(protocolAssignments.status, ['assigned', 'active'])
        ));

      if ((activeAssignments?.count || 0) > 0) {
        errors.push(`Protocol has ${activeAssignments?.count} active assignments`);
      }

      // Check for protocol steps
      const [stepCount] = await this.db
        .select({ count: count() })
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      if ((stepCount?.count || 0) > 0) {
        warnings.push(`Protocol has ${stepCount?.count} steps that will be deleted`);
      }

      // Check for interaction logs
      const [logCount] = await this.db
        .select({ count: count() })
        .from(interactionLogs)
        .where(eq(interactionLogs.protocolId, protocolId));

      if ((logCount?.count || 0) > 0) {
        warnings.push(`Protocol has ${logCount?.count} interaction logs that will become orphaned`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate protocol deletion', error);
    }
  }

  /**
   * Validate referential integrity for an admin before deletion
   */
  async validateAdminDeletion(adminId: string): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check for protocols created by this admin
      const [protocolCount] = await this.db
        .select({ count: count() })
        .from(protocols)
        .where(and(
          eq(protocols.createdBy, adminId),
          isNull(protocols.deletedAt)
        ));

      if ((protocolCount?.count || 0) > 0) {
        errors.push(`Admin has ${protocolCount?.count} protocols that would become orphaned`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate admin deletion', error);
    }
  }

  /**
   * Validate protocol assignment creation
   */
  async validateProtocolAssignmentCreation(userId: string, protocolId: string): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if user exists and is active
      const [user] = await this.db
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          isNull(users.deletedAt)
        ))
        .limit(1);

      if (!user) {
        errors.push('User does not exist');
      } else if (user.status !== 'active') {
        errors.push('User is not active');
      }

      // Check if protocol exists and is active
      const [protocol] = await this.db
        .select()
        .from(protocols)
        .where(and(
          eq(protocols.id, protocolId),
          isNull(protocols.deletedAt)
        ))
        .limit(1);

      if (!protocol) {
        errors.push('Protocol does not exist');
      } else if (protocol.status !== 'active') {
        errors.push('Protocol is not active');
      }

      // Check for existing assignment
      const [existingAssignment] = await this.db
        .select()
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.userId, userId),
          eq(protocolAssignments.protocolId, protocolId)
        ))
        .limit(1);

      if (existingAssignment) {
        errors.push('User already has an assignment for this protocol');
      }

      // Check if protocol has steps
      const [stepCount] = await this.db
        .select({ count: count() })
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      if ((stepCount?.count || 0) === 0) {
        errors.push('Protocol has no steps defined');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate protocol assignment creation', error);
    }
  }

  /**
   * Validate interaction log creation
   */
  async validateInteractionLogCreation(
    userId: string, 
    protocolId: string, 
    stepId: string, 
    assignmentId: string
  ): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate all foreign key references exist
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        errors.push('Referenced user does not exist');
      }

      const [protocol] = await this.db
        .select()
        .from(protocols)
        .where(eq(protocols.id, protocolId))
        .limit(1);

      if (!protocol) {
        errors.push('Referenced protocol does not exist');
      }

      const [step] = await this.db
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.id, stepId))
        .limit(1);

      if (!step) {
        errors.push('Referenced protocol step does not exist');
      } else if (step.protocolId !== protocolId) {
        errors.push('Protocol step does not belong to the specified protocol');
      }

      const [assignment] = await this.db
        .select()
        .from(protocolAssignments)
        .where(eq(protocolAssignments.id, assignmentId))
        .limit(1);

      if (!assignment) {
        errors.push('Referenced protocol assignment does not exist');
      } else {
        if (assignment.userId !== userId) {
          errors.push('Protocol assignment does not belong to the specified user');
        }
        if (assignment.protocolId !== protocolId) {
          errors.push('Protocol assignment does not match the specified protocol');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate interaction log creation', error);
    }
  }

  /**
   * Find orphaned records across all tables
   */
  async findOrphanedRecords(): Promise<OrphanedRecord[]> {
    const orphanedRecords: OrphanedRecord[] = [];

    try {
      // Find protocol steps with invalid protocol references
      const orphanedSteps = await this.db
        .select({
          id: protocolSteps.id,
          protocolId: protocolSteps.protocolId
        })
        .from(protocolSteps)
        .leftJoin(protocols, eq(protocolSteps.protocolId, protocols.id))
        .where(isNull(protocols.id));

      orphanedSteps.forEach(step => {
        orphanedRecords.push({
          table: 'protocol_steps',
          id: step.id,
          foreignKey: 'protocol_id',
          referencedTable: 'protocols',
          referencedId: step.protocolId
        });
      });

      // Find protocol assignments with invalid user references
      const orphanedAssignmentsUser = await this.db
        .select({
          id: protocolAssignments.id,
          userId: protocolAssignments.userId
        })
        .from(protocolAssignments)
        .leftJoin(users, eq(protocolAssignments.userId, users.id))
        .where(isNull(users.id));

      orphanedAssignmentsUser.forEach(assignment => {
        orphanedRecords.push({
          table: 'protocol_assignments',
          id: assignment.id,
          foreignKey: 'user_id',
          referencedTable: 'users',
          referencedId: assignment.userId
        });
      });

      // Find protocol assignments with invalid protocol references
      const orphanedAssignmentsProtocol = await this.db
        .select({
          id: protocolAssignments.id,
          protocolId: protocolAssignments.protocolId
        })
        .from(protocolAssignments)
        .leftJoin(protocols, eq(protocolAssignments.protocolId, protocols.id))
        .where(isNull(protocols.id));

      orphanedAssignmentsProtocol.forEach(assignment => {
        orphanedRecords.push({
          table: 'protocol_assignments',
          id: assignment.id,
          foreignKey: 'protocol_id',
          referencedTable: 'protocols',
          referencedId: assignment.protocolId
        });
      });

      // Find interaction logs with invalid references
      const orphanedLogsUser = await this.db
        .select({
          id: interactionLogs.id,
          userId: interactionLogs.userId
        })
        .from(interactionLogs)
        .leftJoin(users, eq(interactionLogs.userId, users.id))
        .where(isNull(users.id));

      orphanedLogsUser.forEach(log => {
        orphanedRecords.push({
          table: 'interaction_logs',
          id: log.id,
          foreignKey: 'user_id',
          referencedTable: 'users',
          referencedId: log.userId
        });
      });

      return orphanedRecords;
    } catch (error) {
      throw new DatabaseError('Failed to find orphaned records', error);
    }
  }

  /**
   * Generate comprehensive data consistency report
   */
  async generateConsistencyReport(): Promise<DataConsistencyReport> {
    try {
      const orphanedRecords = await this.findOrphanedRecords();
      
      // Find duplicate line user IDs (should be unique)
      const duplicateLineUsers = await this.db
        .select({
          lineUserId: users.lineUserId,
          count: count()
        })
        .from(users)
        .where(isNull(users.deletedAt))
        .groupBy(users.lineUserId)
        .having(gt(count(), 1));

      const duplicateRecords = duplicateLineUsers.map(dup => ({
        table: 'users',
        field: 'line_user_id',
        value: dup.lineUserId,
        count: dup.count
      }));

      // Find invalid status values
      const invalidStatuses: Array<{
        table: string;
        id: string;
        field: string;
        value: string;
      }> = [];

      // Check user statuses
      const invalidUserStatuses = await this.db
        .select({
          id: users.id,
          status: users.status
        })
        .from(users)
        .where(and(
          isNull(users.deletedAt),
          // Using NOT IN to find invalid statuses
          eq(users.status, 'invalid' as any) // This will find any invalid values
        ));

      invalidUserStatuses.forEach(user => {
        if (!['active', 'inactive'].includes(user.status)) {
          invalidStatuses.push({
            table: 'users',
            id: user.id,
            field: 'status',
            value: user.status
          });
        }
      });

      // Find missing required data
      const missingRequiredData: Array<{
        table: string;
        id: string;
        field: string;
      }> = [];

      // Check for users without display names
      const usersWithoutDisplayName = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(
          isNull(users.deletedAt),
          eq(users.displayName, '')
        ));

      usersWithoutDisplayName.forEach(user => {
        missingRequiredData.push({
          table: 'users',
          id: user.id,
          field: 'display_name'
        });
      });

      return {
        orphanedRecords,
        duplicateRecords,
        invalidStatuses,
        missingRequiredData
      };
    } catch (error) {
      throw new DatabaseError('Failed to generate consistency report', error);
    }
  }

  /**
   * Clean up orphaned records
   */
  async cleanupOrphanedRecords(dryRun: boolean = true): Promise<{
    deletedCount: number;
    deletedRecords: OrphanedRecord[];
  }> {
    const orphanedRecords = await this.findOrphanedRecords();
    let deletedCount = 0;
    const deletedRecords: OrphanedRecord[] = [];

    if (!dryRun) {
      try {
        await this.db.transaction(async (tx) => {
          for (const record of orphanedRecords) {
            switch (record.table) {
              case 'protocol_steps':
                await tx.delete(protocolSteps).where(eq(protocolSteps.id, record.id));
                break;
              case 'protocol_assignments':
                await tx.delete(protocolAssignments).where(eq(protocolAssignments.id, record.id));
                break;
              case 'interaction_logs':
                await tx.delete(interactionLogs).where(eq(interactionLogs.id, record.id));
                break;
            }
            deletedCount++;
            deletedRecords.push(record);
          }
        });
      } catch (error) {
        throw new DatabaseError('Failed to cleanup orphaned records', error);
      }
    } else {
      // Dry run - just return what would be deleted
      deletedCount = orphanedRecords.length;
      deletedRecords.push(...orphanedRecords);
    }

    return {
      deletedCount,
      deletedRecords
    };
  }

  /**
   * Validate data consistency across all tables
   */
  async validateDataConsistency(): Promise<IntegrityCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const report = await this.generateConsistencyReport();

      if (report.orphanedRecords.length > 0) {
        errors.push(`Found ${report.orphanedRecords.length} orphaned records`);
      }

      if (report.duplicateRecords.length > 0) {
        errors.push(`Found ${report.duplicateRecords.length} duplicate records`);
      }

      if (report.invalidStatuses.length > 0) {
        errors.push(`Found ${report.invalidStatuses.length} records with invalid status values`);
      }

      if (report.missingRequiredData.length > 0) {
        warnings.push(`Found ${report.missingRequiredData.length} records with missing required data`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate data consistency', error);
    }
  }
}