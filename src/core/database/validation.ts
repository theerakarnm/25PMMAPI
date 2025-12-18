import { z } from 'zod';
import { eq, and, isNull, count } from 'drizzle-orm';
import { database } from './connection.js';
import { 
  users, 
  admins, 
  protocols, 
  protocolSteps, 
  protocolAssignments 
} from './schema.js';
import { ValidationError, DatabaseError } from '../errors/app-error.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConstraintViolation {
  field: string;
  value: any;
  constraint: string;
  message: string;
}

export class DataValidationService {
  private db = database;

  /**
   * Enhanced user validation with database constraints
   */
  async validateUserData(userData: any, isUpdate: boolean = false, userId?: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic schema validation
      const userSchema = z.object({
        lineUserId: z.string().min(1, 'LINE User ID is required'),
        displayName: z.string().min(1, 'Display name is required').max(255, 'Display name too long'),
        pictureUrl: z.string().url('Invalid picture URL').optional().or(z.literal('')),
        realName: z.string().max(255, 'Real name too long').optional(),
        hospitalNumber: z.string().max(100, 'Hospital number too long').optional(),
        status: z.enum(['active', 'inactive'], {
          errorMap: () => ({ message: 'Status must be either active or inactive' })
        }).optional()
      });

      const validation = userSchema.safeParse(userData);
      if (!validation.success) {
        validation.error.errors.forEach(err => {
          errors.push(`${err.path.join('.')}: ${err.message}`);
        });
      }

      // Database constraint validation
      if (userData.lineUserId) {
        const existingUser = await this.db
          .select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.lineUserId, userData.lineUserId),
            isNull(users.deletedAt),
            isUpdate && userId ? ne(users.id, userId) : undefined
          ))
          .limit(1);

        if (existingUser.length > 0) {
          errors.push('LINE User ID already exists');
        }
      }

      // Business rule validation
      if (userData.hospitalNumber && userData.hospitalNumber.length > 0) {
        // Validate hospital number format (example: HN followed by digits)
        const hnPattern = /^HN\d{6,10}$/;
        if (!hnPattern.test(userData.hospitalNumber)) {
          warnings.push('Hospital number should follow format HN followed by 6-10 digits');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate user data', error);
    }
  }

  /**
   * Enhanced protocol validation with step consistency
   */
  async validateProtocolData(protocolData: any, isUpdate: boolean = false, protocolId?: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic schema validation
      const protocolSchema = z.object({
        name: z.string().min(1, 'Protocol name is required').max(255, 'Protocol name too long'),
        description: z.string().max(1000, 'Description too long').optional(),
        createdBy: z.string().uuid('Invalid admin ID'),
        status: z.enum(['draft', 'active', 'paused', 'completed'], {
          errorMap: () => ({ message: 'Invalid protocol status' })
        }).optional()
      });

      const validation = protocolSchema.safeParse(protocolData);
      if (!validation.success) {
        validation.error.errors.forEach(err => {
          errors.push(`${err.path.join('.')}: ${err.message}`);
        });
      }

      // Validate admin exists
      if (protocolData.createdBy) {
        const [admin] = await this.db
          .select({ id: admins.id, isActive: admins.isActive })
          .from(admins)
          .where(and(
            eq(admins.id, protocolData.createdBy),
            isNull(admins.deletedAt)
          ))
          .limit(1);

        if (!admin) {
          errors.push('Referenced admin does not exist');
        } else if (!admin.isActive) {
          errors.push('Referenced admin is not active');
        }
      }

      // Check for duplicate protocol names by the same admin
      if (protocolData.name && protocolData.createdBy) {
        const existingProtocol = await this.db
          .select({ id: protocols.id })
          .from(protocols)
          .where(and(
            eq(protocols.name, protocolData.name),
            eq(protocols.createdBy, protocolData.createdBy),
            isNull(protocols.deletedAt),
            isUpdate && protocolId ? ne(protocols.id, protocolId) : undefined
          ))
          .limit(1);

        if (existingProtocol.length > 0) {
          warnings.push('Protocol with this name already exists for this admin');
        }
      }

      // Status transition validation
      if (isUpdate && protocolId && protocolData.status) {
        const [currentProtocol] = await this.db
          .select({ status: protocols.status })
          .from(protocols)
          .where(eq(protocols.id, protocolId))
          .limit(1);

        if (currentProtocol) {
          const validTransitions: Record<string, string[]> = {
            'draft': ['active', 'paused'],
            'active': ['paused', 'completed'],
            'paused': ['active', 'completed'],
            'completed': [] // No transitions from completed
          };

          const allowedStatuses = validTransitions[currentProtocol.status] || [];
          if (!allowedStatuses.includes(protocolData.status)) {
            errors.push(`Cannot transition from ${currentProtocol.status} to ${protocolData.status}`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate protocol data', error);
    }
  }

  /**
   * Enhanced protocol step validation
   */
  async validateProtocolStepData(stepData: any, protocolId?: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic schema validation
      const stepSchema = z.object({
        protocolId: z.string().uuid('Invalid protocol ID'),
        stepOrder: z.string().min(1, 'Step order is required'),
        triggerType: z.enum(['immediate', 'delay', 'scheduled'], {
          errorMap: () => ({ message: 'Invalid trigger type' })
        }),
        triggerValue: z.string().min(1, 'Trigger value is required'),
        messageType: z.enum(['text', 'image', 'link', 'flex'], {
          errorMap: () => ({ message: 'Invalid message type' })
        }),
        contentPayload: z.any(),
        requiresAction: z.boolean().optional(),
        feedbackConfig: z.object({
          question: z.string().min(1, 'Feedback question is required'),
          buttons: z.array(z.object({
            label: z.string().min(1, 'Button label is required'),
            value: z.string().min(1, 'Button value is required'),
            action: z.enum(['complete', 'postpone', 'skip'])
          })).min(1, 'At least one button is required').max(5, 'Maximum 5 buttons allowed')
        }).optional()
      });

      const validation = stepSchema.safeParse(stepData);
      if (!validation.success) {
        validation.error.errors.forEach(err => {
          errors.push(`${err.path.join('.')}: ${err.message}`);
        });
      }

      // Validate protocol exists and is editable
      if (stepData.protocolId || protocolId) {
        const targetProtocolId = stepData.protocolId || protocolId;
        const [protocol] = await this.db
          .select({ status: protocols.status })
          .from(protocols)
          .where(and(
            eq(protocols.id, targetProtocolId),
            isNull(protocols.deletedAt)
          ))
          .limit(1);

        if (!protocol) {
          errors.push('Referenced protocol does not exist');
        } else if (protocol.status === 'completed') {
          errors.push('Cannot modify steps of a completed protocol');
        } else if (protocol.status === 'active') {
          warnings.push('Modifying steps of an active protocol may affect ongoing assignments');
        }
      }

      // Validate step order uniqueness within protocol
      if (stepData.protocolId && stepData.stepOrder) {
        const existingStep = await this.db
          .select({ id: protocolSteps.id })
          .from(protocolSteps)
          .where(and(
            eq(protocolSteps.protocolId, stepData.protocolId),
            eq(protocolSteps.stepOrder, stepData.stepOrder)
          ))
          .limit(1);

        if (existingStep.length > 0) {
          errors.push('Step order already exists for this protocol');
        }
      }

      // Validate trigger value based on trigger type
      if (stepData.triggerType && stepData.triggerValue) {
        switch (stepData.triggerType) {
          case 'delay':
            // Should be a duration like "1h", "30m", "2d"
            const delayPattern = /^\d+[smhd]$/;
            if (!delayPattern.test(stepData.triggerValue)) {
              errors.push('Delay trigger value should be in format like "1h", "30m", "2d"');
            }
            break;
          case 'scheduled':
            // Should be a time like "09:00", "14:30"
            const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timePattern.test(stepData.triggerValue)) {
              errors.push('Scheduled trigger value should be in HH:MM format');
            }
            break;
          case 'immediate':
            // Should be "0" or empty
            if (stepData.triggerValue !== '0' && stepData.triggerValue !== '') {
              warnings.push('Immediate trigger value should be "0" or empty');
            }
            break;
        }
      }

      // Validate content payload based on message type
      if (stepData.messageType && stepData.contentPayload) {
        switch (stepData.messageType) {
          case 'text':
            if (typeof stepData.contentPayload !== 'string' || stepData.contentPayload.length === 0) {
              errors.push('Text message content must be a non-empty string');
            } else if (stepData.contentPayload.length > 5000) {
              errors.push('Text message content is too long (max 5000 characters)');
            }
            break;
          case 'image':
            if (typeof stepData.contentPayload !== 'string' || !stepData.contentPayload.startsWith('http')) {
              errors.push('Image message content must be a valid URL');
            }
            break;
          case 'link':
            if (typeof stepData.contentPayload !== 'string' || !stepData.contentPayload.startsWith('http')) {
              errors.push('Link message content must be a valid URL');
            }
            break;
          case 'flex':
            if (typeof stepData.contentPayload !== 'object') {
              errors.push('Flex message content must be a valid JSON object');
            }
            break;
        }
      }

      // Validate feedback configuration consistency
      if (stepData.requiresAction && !stepData.feedbackConfig) {
        warnings.push('Step requires action but no feedback configuration provided');
      } else if (!stepData.requiresAction && stepData.feedbackConfig) {
        warnings.push('Feedback configuration provided but step does not require action');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate protocol step data', error);
    }
  }

  /**
   * Validate protocol assignment constraints
   */
  async validateProtocolAssignmentConstraints(
    userId: string, 
    protocolId: string, 
    assignmentData?: any
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check user exists and is active
      const [user] = await this.db
        .select({ status: users.status })
        .from(users)
        .where(and(
          eq(users.id, userId),
          isNull(users.deletedAt)
        ))
        .limit(1);

      if (!user) {
        errors.push('User does not exist');
      } else if (user.status !== 'active') {
        errors.push('Cannot assign protocol to inactive user');
      }

      // Check protocol exists and is assignable
      const [protocol] = await this.db
        .select({ status: protocols.status })
        .from(protocols)
        .where(and(
          eq(protocols.id, protocolId),
          isNull(protocols.deletedAt)
        ))
        .limit(1);

      if (!protocol) {
        errors.push('Protocol does not exist');
      } else if (protocol.status !== 'active') {
        errors.push('Cannot assign non-active protocol');
      }

      // Check for existing assignment
      const [existingAssignment] = await this.db
        .select({ status: protocolAssignments.status })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.userId, userId),
          eq(protocolAssignments.protocolId, protocolId)
        ))
        .limit(1);

      if (existingAssignment) {
        if (['assigned', 'active'].includes(existingAssignment.status)) {
          errors.push('User already has an active assignment for this protocol');
        } else {
          warnings.push(`User has a ${existingAssignment.status} assignment for this protocol`);
        }
      }

      // Check protocol has steps
      const [stepCount] = await this.db
        .select({ count: count() })
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      if ((stepCount?.count || 0) === 0) {
        errors.push('Cannot assign protocol without steps');
      }

      // Check user's current assignment load
      const [activeAssignments] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.userId, userId),
          eq(protocolAssignments.status, 'active')
        ));

      if ((activeAssignments?.count || 0) >= 5) {
        warnings.push('User already has 5 or more active protocol assignments');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate protocol assignment constraints', error);
    }
  }

  /**
   * Validate business rules for status transitions
   */
  async validateStatusTransition(
    table: 'users' | 'protocols' | 'protocol_assignments',
    id: string,
    newStatus: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      switch (table) {
        case 'users':
          const [user] = await this.db
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

          if (!user) {
            errors.push('User not found');
            break;
          }

          // Check if user has active assignments before deactivating
          if (newStatus === 'inactive' && user.status === 'active') {
            const [activeAssignments] = await this.db
              .select({ count: count() })
              .from(protocolAssignments)
              .where(and(
                eq(protocolAssignments.userId, id),
                eq(protocolAssignments.status, 'active')
              ));

            if ((activeAssignments?.count || 0) > 0) {
              warnings.push(`User has ${activeAssignments?.count} active protocol assignments`);
            }
          }
          break;

        case 'protocols':
          const [protocol] = await this.db
            .select({ status: protocols.status })
            .from(protocols)
            .where(eq(protocols.id, id))
            .limit(1);

          if (!protocol) {
            errors.push('Protocol not found');
            break;
          }

          // Validate protocol status transitions
          const protocolTransitions: Record<string, string[]> = {
            'draft': ['active'],
            'active': ['paused', 'completed'],
            'paused': ['active', 'completed'],
            'completed': []
          };

          const allowedProtocolStatuses = protocolTransitions[protocol.status] || [];
          if (!allowedProtocolStatuses.includes(newStatus)) {
            errors.push(`Cannot transition protocol from ${protocol.status} to ${newStatus}`);
          }

          // Check if protocol has steps before activating
          if (newStatus === 'active' && protocol.status === 'draft') {
            const [stepCount] = await this.db
              .select({ count: count() })
              .from(protocolSteps)
              .where(eq(protocolSteps.protocolId, id));

            if ((stepCount?.count || 0) === 0) {
              errors.push('Cannot activate protocol without steps');
            }
          }
          break;

        case 'protocol_assignments':
          const [assignment] = await this.db
            .select({ status: protocolAssignments.status })
            .from(protocolAssignments)
            .where(eq(protocolAssignments.id, id))
            .limit(1);

          if (!assignment) {
            errors.push('Protocol assignment not found');
            break;
          }

          // Validate assignment status transitions
          const assignmentTransitions: Record<string, string[]> = {
            'assigned': ['active', 'paused'],
            'active': ['paused', 'completed'],
            'paused': ['active', 'completed'],
            'completed': []
          };

          const allowedAssignmentStatuses = assignmentTransitions[assignment.status] || [];
          if (!allowedAssignmentStatuses.includes(newStatus)) {
            errors.push(`Cannot transition assignment from ${assignment.status} to ${newStatus}`);
          }
          break;
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw new DatabaseError('Failed to validate status transition', error);
    }
  }
}

// Import sql from drizzle-orm
import { sql, ne } from 'drizzle-orm';