import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { DataIntegrityService } from '../integrity.js';
import { DataValidationService } from '../validation.js';
import { DataMigrationService } from '../migration-utils.js';
import { dataIntegrityService } from '../data-integrity-service.js';
import { database } from '../connection.js';
import { 
  users, 
  admins, 
  protocols, 
  protocolSteps, 
  protocolAssignments, 
  interactionLogs 
} from '../schema.js';
import { eq, ne } from 'drizzle-orm';

describe('Data Integrity Service', () => {
  let testUserId: string;
  let testAdminId: string;
  let testProtocolId: string;
  let testStepId: string;
  let testAssignmentId: string;

  beforeAll(async () => {
    // Create test data
    const [admin] = await database
      .insert(admins)
      .values({
        email: 'test-integrity@example.com',
        passwordHash: 'hashed_password',
        name: 'Test Admin',
        role: 'admin',
        isActive: true
      })
      .returning();
    testAdminId = admin.id;

    const [user] = await database
      .insert(users)
      .values({
        lineUserId: 'test-line-user-integrity',
        displayName: 'Test User Integrity',
        status: 'active'
      })
      .returning();
    testUserId = user.id;

    const [protocol] = await database
      .insert(protocols)
      .values({
        name: 'Test Protocol Integrity',
        description: 'Test protocol for integrity testing',
        createdBy: testAdminId,
        status: 'active'
      })
      .returning();
    testProtocolId = protocol.id;

    const [step] = await database
      .insert(protocolSteps)
      .values({
        protocolId: testProtocolId,
        stepOrder: '1',
        triggerType: 'immediate',
        triggerValue: '0',
        messageType: 'text',
        contentPayload: 'Test message',
        requiresAction: false
      })
      .returning();
    testStepId = step.id;

    const [assignment] = await database
      .insert(protocolAssignments)
      .values({
        userId: testUserId,
        protocolId: testProtocolId,
        status: 'active',
        totalSteps: 1,
        completedSteps: 0
      })
      .returning();
    testAssignmentId = assignment.id;
  });

  afterAll(async () => {
    // Clean up test data
    await database.delete(interactionLogs).where(eq(interactionLogs.userId, testUserId));
    await database.delete(protocolAssignments).where(eq(protocolAssignments.id, testAssignmentId));
    await database.delete(protocolSteps).where(eq(protocolSteps.id, testStepId));
    await database.delete(protocols).where(eq(protocols.id, testProtocolId));
    await database.delete(users).where(eq(users.id, testUserId));
    await database.delete(admins).where(eq(admins.id, testAdminId));
  });

  describe('DataIntegrityService', () => {
    const integrityService = new DataIntegrityService();

    test('should validate protocol assignment creation successfully', async () => {
      // Create a new user for this test
      const [newUser] = await database
        .insert(users)
        .values({
          lineUserId: 'test-line-user-new',
          displayName: 'New Test User',
          status: 'active'
        })
        .returning();

      const result = await integrityService.validateProtocolAssignmentCreation(
        newUser.id, 
        testProtocolId
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Clean up
      await database.delete(users).where(eq(users.id, newUser.id));
    });

    test('should detect invalid protocol assignment creation', async () => {
      const result = await integrityService.validateProtocolAssignmentCreation(
        'invalid-user-id', 
        testProtocolId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('User does not exist');
    });

    test('should validate interaction log creation successfully', async () => {
      const result = await integrityService.validateInteractionLogCreation(
        testUserId,
        testProtocolId,
        testStepId,
        testAssignmentId
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid interaction log creation', async () => {
      const result = await integrityService.validateInteractionLogCreation(
        testUserId,
        testProtocolId,
        'invalid-step-id',
        testAssignmentId
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate user deletion constraints', async () => {
      const result = await integrityService.validateUserDeletion(testUserId);

      // Should fail because user has active assignments
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should generate consistency report', async () => {
      const report = await integrityService.generateConsistencyReport();

      expect(report).toHaveProperty('orphanedRecords');
      expect(report).toHaveProperty('duplicateRecords');
      expect(report).toHaveProperty('invalidStatuses');
      expect(report).toHaveProperty('missingRequiredData');
      expect(Array.isArray(report.orphanedRecords)).toBe(true);
    });
  });

  describe('DataValidationService', () => {
    const validationService = new DataValidationService();

    test('should validate user data successfully', async () => {
      const userData = {
        lineUserId: 'valid-line-user-id',
        displayName: 'Valid User',
        pictureUrl: 'https://example.com/picture.jpg',
        status: 'active'
      };

      const result = await validationService.validateUserData(userData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid user data', async () => {
      const userData = {
        lineUserId: '', // Invalid: empty
        displayName: 'Valid User',
        pictureUrl: 'invalid-url', // Invalid: not a URL
        status: 'invalid-status' // Invalid: not in enum
      };

      const result = await validationService.validateUserData(userData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate protocol data successfully', async () => {
      const protocolData = {
        name: 'Valid Protocol',
        description: 'A valid protocol description',
        createdBy: testAdminId,
        status: 'draft'
      };

      const result = await validationService.validateProtocolData(protocolData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid protocol data', async () => {
      const protocolData = {
        name: '', // Invalid: empty
        createdBy: 'invalid-admin-id', // Invalid: not UUID
        status: 'invalid-status' // Invalid: not in enum
      };

      const result = await validationService.validateProtocolData(protocolData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate protocol step data successfully', async () => {
      const stepData = {
        protocolId: testProtocolId,
        stepOrder: '2',
        triggerType: 'delay',
        triggerValue: '1h',
        messageType: 'text',
        contentPayload: 'Valid message content',
        requiresAction: false
      };

      const result = await validationService.validateProtocolStepData(stepData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid protocol step data', async () => {
      const stepData = {
        protocolId: 'invalid-protocol-id', // Invalid: not UUID
        stepOrder: '', // Invalid: empty
        triggerType: 'invalid-trigger', // Invalid: not in enum
        triggerValue: '',
        messageType: 'invalid-type', // Invalid: not in enum
        contentPayload: ''
      };

      const result = await validationService.validateProtocolStepData(stepData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate status transitions', async () => {
      // Valid transition: draft -> active
      const validResult = await validationService.validateStatusTransition(
        'protocols',
        testProtocolId,
        'paused'
      );

      expect(validResult.isValid).toBe(true);

      // Invalid transition: completed -> draft (if protocol was completed)
      // First update protocol to completed status for testing
      await database
        .update(protocols)
        .set({ status: 'completed' })
        .where(eq(protocols.id, testProtocolId));

      const invalidResult = await validationService.validateStatusTransition(
        'protocols',
        testProtocolId,
        'draft'
      );

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);

      // Reset protocol status
      await database
        .update(protocols)
        .set({ status: 'active' })
        .where(eq(protocols.id, testProtocolId));
    });
  });

  describe('DataMigrationService', () => {
    const migrationService = new DataMigrationService();

    test('should recalculate adherence rates', async () => {
      // Create an interaction log for testing
      await database
        .insert(interactionLogs)
        .values({
          userId: testUserId,
          protocolId: testProtocolId,
          stepId: testStepId,
          assignmentId: testAssignmentId,
          sentAt: new Date(),
          status: 'responded',
          respondedAt: new Date(),
          responseValue: 'completed'
        });

      const result = await migrationService.recalculateAdherenceRates({
        batchSize: 10,
        continueOnError: true
      });

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);

      // Clean up
      await database.delete(interactionLogs).where(eq(interactionLogs.userId, testUserId));
    });

    test('should run comprehensive migration in dry run mode', async () => {
      const result = await migrationService.runComprehensiveMigration({
        dryRun: true,
        batchSize: 10
      });

      expect(result.overall.success).toBe(true);
      expect(result.details).toHaveProperty('referentialIntegrity');
      expect(result.details).toHaveProperty('stepOrdering');
      expect(result.details).toHaveProperty('timestampConsistency');
      expect(result.details).toHaveProperty('adherenceRates');
    });
  });

  describe('ComprehensiveDataIntegrityService', () => {
    test('should validate user data and throw error on invalid data', async () => {
      const invalidUserData = {
        lineUserId: '', // Invalid
        displayName: 'Test User'
      };

      expect(async () => {
        await dataIntegrityService.validateUser(invalidUserData);
      }).toThrow();
    });

    test('should validate protocol assignment successfully', async () => {
      // Create a new user for this test
      const [newUser] = await database
        .insert(users)
        .values({
          lineUserId: 'test-line-user-assignment',
          displayName: 'Assignment Test User',
          status: 'active'
        })
        .returning();

      // Should not throw
      await dataIntegrityService.validateProtocolAssignment(newUser.id, testProtocolId);

      // Clean up
      await database.delete(users).where(eq(users.id, newUser.id));
    });

    test('should generate comprehensive integrity report', async () => {
      const report = await dataIntegrityService.generateIntegrityReport({
        validateReferentialIntegrity: true,
        validateConstraints: true,
        runMigrations: false
      });

      expect(report).toHaveProperty('integrity');
      expect(report).toHaveProperty('validation');
      expect(report).toHaveProperty('timestamp');
      expect(report.integrity).toHaveProperty('isValid');
      expect(report.validation).toHaveProperty('isValid');
    });

    test('should get consistency report', async () => {
      const report = await dataIntegrityService.getConsistencyReport();

      expect(report).toHaveProperty('orphanedRecords');
      expect(report).toHaveProperty('duplicateRecords');
      expect(report).toHaveProperty('invalidStatuses');
      expect(report).toHaveProperty('missingRequiredData');
    });
  });
});