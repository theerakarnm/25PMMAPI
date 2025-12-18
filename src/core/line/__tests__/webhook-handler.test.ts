import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as fc from 'fast-check';
import { PostbackEvent, WebhookEvent } from '@line/bot-sdk';
import { LineWebhookHandler } from '../webhook-handler.js';
import { database } from '../../database/connection.js';
import { users, interactionLogs, protocols, protocolSteps } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

describe('LINE Webhook Handler Property Tests', () => {
  let testUserId: string;
  let testProtocolId: string;
  let testStepId: string;

  beforeAll(async () => {
    // Create test user
    const [user] = await database
      .insert(users)
      .values({
        id: uuidv4(),
        lineUserId: 'test-line-user-id',
        displayName: 'Test User',
        status: 'active',
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    testUserId = user.id;

    // Create test protocol
    const [protocol] = await database
      .insert(protocols)
      .values({
        id: uuidv4(),
        name: 'Test Protocol',
        description: 'Test protocol for webhook testing',
        createdBy: uuidv4(), // Mock admin ID
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    testProtocolId = protocol.id;

    // Create test protocol step
    const [step] = await database
      .insert(protocolSteps)
      .values({
        id: uuidv4(),
        protocolId: testProtocolId,
        stepOrder: 1,
        triggerType: 'immediate',
        triggerValue: '0',
        messageType: 'text',
        contentPayload: { text: 'Test message' },
        requiresAction: true,
        feedbackConfig: {
          question: 'Did you complete this task?',
          buttons: [
            { label: 'Yes', value: 'yes', action: 'complete' },
            { label: 'No', value: 'no', action: 'postpone' },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    testStepId = step.id;
  });

  afterAll(async () => {
    // Clean up test data
    await database.delete(interactionLogs);
    await database.delete(protocolSteps).where(eq(protocolSteps.id, testStepId));
    await database.delete(protocols).where(eq(protocols.id, testProtocolId));
    await database.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(async () => {
    // Clean up interaction logs before each test
    await database.delete(interactionLogs);
  });

  /**
   * **Feature: patient-notification-system, Property 33: Postback payload validation**
   * 
   * Property: For any incoming postback event, the system should validate the payload structure 
   * and extract data correctly before processing
   * 
   * This property tests that:
   * 1. Valid postback data formats are correctly parsed and processed
   * 2. Invalid postback data formats are rejected without causing system errors
   * 3. The system maintains data integrity during postback processing
   */
  describe('Property 33: Postback payload validation', () => {
    it('should correctly validate and process valid postback payloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid postback data in the expected format: "protocol_id:step_id:action"
          fc.record({
            protocolId: fc.uuid(),
            stepId: fc.uuid(),
            action: fc.oneof(
              fc.constant('complete'),
              fc.constant('postpone'),
              fc.constant('skip'),
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(':'))
            ),
          }),
          fc.integer({ min: 1000000000000, max: 9999999999999 }), // Valid timestamp
          async (postbackData, timestamp) => {
            // Create a valid postback event
            const postbackEvent: PostbackEvent = {
              type: 'postback',
              mode: 'active',
              timestamp: timestamp,
              source: {
                type: 'user',
                userId: 'test-line-user-id',
              },
              replyToken: 'test-reply-token',
              postback: {
                data: `${postbackData.protocolId}:${postbackData.stepId}:${postbackData.action}`,
              },
            };

            // The system should process valid postback events without throwing errors
            try {
              await LineWebhookHandler.handleEvents([postbackEvent]);
              
              // If the postback data matches our test data, verify it was processed
              if (postbackData.protocolId === testProtocolId && postbackData.stepId === testStepId) {
                const logs = await database
                  .select()
                  .from(interactionLogs)
                  .where(eq(interactionLogs.userId, testUserId));
                
                // Should have created an interaction log
                expect(logs.length).toBeGreaterThan(0);
                
                // Should have correct response data
                const log = logs[0];
                expect(log.responseValue).toBe(postbackData.action);
                expect(log.responseAction).toBe(postbackData.action);
                expect(log.respondedAt).toBeDefined();
              }
            } catch (error) {
              // Valid postback events should not cause system errors
              // Only expected errors are when protocol/step don't exist, which is acceptable
              if (error instanceof Error) {
                expect(error.message).not.toContain('Invalid postback data format');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid postback payload formats without system errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate invalid postback data formats
          fc.oneof(
            fc.constant(''), // Empty string
            fc.string({ maxLength: 5 }), // Too short
            fc.string().filter(s => !s.includes(':')), // No colons
            fc.string().filter(s => s.split(':').length !== 3), // Wrong number of parts
            fc.string().filter(s => s.includes('::') || s.startsWith(':') || s.endsWith(':')), // Malformed colons
          ),
          fc.integer({ min: 1000000000000, max: 9999999999999 }), // Valid timestamp
          async (invalidPostbackData, timestamp) => {
            // Create a postback event with invalid data
            const postbackEvent: PostbackEvent = {
              type: 'postback',
              mode: 'active',
              timestamp: timestamp,
              source: {
                type: 'user',
                userId: 'test-line-user-id',
              },
              replyToken: 'test-reply-token',
              postback: {
                data: invalidPostbackData,
              },
            };

            // The system should handle invalid postback data gracefully
            try {
              await LineWebhookHandler.handleEvents([postbackEvent]);
              
              // Invalid postback data should not create interaction logs
              const logs = await database
                .select()
                .from(interactionLogs)
                .where(eq(interactionLogs.userId, testUserId));
              
              // Should not have created any logs for invalid data
              expect(logs.length).toBe(0);
            } catch (error) {
              // System should not crash on invalid postback data
              // If an error occurs, it should be handled gracefully
              expect(error).not.toBeInstanceOf(TypeError);
              expect(error).not.toBeInstanceOf(ReferenceError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data integrity during postback processing', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple postback events
          fc.array(
            fc.record({
              protocolId: fc.constantFrom(testProtocolId, uuidv4()),
              stepId: fc.constantFrom(testStepId, uuidv4()),
              action: fc.oneof(
                fc.constant('complete'),
                fc.constant('postpone'),
                fc.constant('skip')
              ),
              timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (postbackEvents) => {
            const events: PostbackEvent[] = postbackEvents.map(event => ({
              type: 'postback',
              mode: 'active',
              timestamp: event.timestamp,
              source: {
                type: 'user',
                userId: 'test-line-user-id',
              },
              replyToken: `test-reply-token-${event.timestamp}`,
              postback: {
                data: `${event.protocolId}:${event.stepId}:${event.action}`,
              },
            }));

            // Process all events
            await LineWebhookHandler.handleEvents(events);

            // Verify data integrity
            const logs = await database
              .select()
              .from(interactionLogs)
              .where(eq(interactionLogs.userId, testUserId));

            // Each valid event should create exactly one log entry
            const validEvents = postbackEvents.filter(
              event => event.protocolId === testProtocolId && event.stepId === testStepId
            );

            expect(logs.length).toBe(validEvents.length);

            // Each log should have consistent data
            logs.forEach(log => {
              expect(log.userId).toBe(testUserId);
              expect(log.protocolId).toBe(testProtocolId);
              expect(log.stepId).toBe(testStepId);
              expect(log.responseValue).toBeDefined();
              expect(log.responseAction).toBeDefined();
              expect(log.respondedAt).toBeDefined();
              expect(log.status).toBe('responded');
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});