import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { database } from '../../../core/database/connection.js';
import { sql } from 'drizzle-orm';
import {
  admins,
  users,
  protocols,
  protocolSteps,
  protocolAssignments,
  interactionLogs
} from '../../../core/database/schema.js';
import { ProtocolRepository } from '../repository.js';

describe('Protocol Lifecycle (soft delete)', () => {
  let repo: ProtocolRepository;
  let adminId: string;
  let userId: string;
  let protocolId: string;
  let step1Id: string;
  let step2Id: string;
  let assignmentId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    repo = new ProtocolRepository();

    const [admin] = await database
      .insert(admins)
      .values({
        email: `lifecycle-${stamp}@test.local`,
        passwordHash: 'hashed_password',
        name: 'LifeCycle Test Admin',
        role: 'admin',
        isActive: true
      })
      .returning();
    adminId = admin.id;

    const [user] = await database
      .insert(users)
      .values({
        lineUserId: `lifecycle-${stamp}`,
        displayName: 'LifeCycle Test User',
        status: 'active'
      })
      .returning();
    userId = user.id;

    // status 'draft' so the minute-based scheduler never selects this fixture
    const [protocol] = await database
      .insert(protocols)
      .values({
        name: `LifeCycle Test ${stamp}`,
        description: 'fixture for protocol-lifecycle tests',
        createdBy: adminId,
        status: 'draft'
      })
      .returning();
    protocolId = protocol.id;

    const [step1] = await database
      .insert(protocolSteps)
      .values({
        protocolId,
        stepOrder: '1',
        triggerType: 'immediate',
        triggerValue: '0',
        messageType: 'text',
        contentPayload: { text: 'LifeCycle step one' },
        requiresAction: false
      })
      .returning();
    step1Id = step1.id;

    const [step2] = await database
      .insert(protocolSteps)
      .values({
        protocolId,
        stepOrder: '2',
        triggerType: 'immediate',
        triggerValue: '0',
        messageType: 'text',
        contentPayload: { text: 'LifeCycle step two' },
        requiresAction: false
      })
      .returning();
    step2Id = step2.id;

    const [assignment] = await database
      .insert(protocolAssignments)
      .values({
        userId,
        protocolId,
        status: 'active',
        totalSteps: 2
      })
      .returning();
    assignmentId = assignment.id;
  });

  test('deleteStep soft-deletes: reads return null while the raw row keeps a non-null deleted_at', async () => {
    const deleted = await repo.deleteStep(step1Id);
    expect(deleted).toBe(true);

    const viaFind = await repo.findStepById(step1Id);
    expect(viaFind).toBeNull();

    const raw = await database.execute(
      sql`select deleted_at from protocol_steps where id = ${step1Id}`
    );
    const row = raw.rows[0];
    expect(row).toBeDefined();
    expect(row.deleted_at).not.toBeNull();
  });

  test('softDeleteStepsByProtocolId soft-deletes every live step, returns the count, and keeps the rows', async () => {
    // The previous test left step1 soft-deleted; revive it via raw SQL so the
    // protocol once again has the two live steps the beforeAll fixture defines.
    await database.execute(
      sql`update protocol_steps set deleted_at = null, updated_at = now() where id = ${step1Id}`
    );

    const deletedCount = await repo.softDeleteStepsByProtocolId(protocolId);
    expect(deletedCount).toBe(2);

    const liveCount = await repo.getStepCountByProtocolId(protocolId);
    expect(liveCount).toBe(0);

    const raw = await database.execute(
      sql`select id, step_order, deleted_at from protocol_steps where protocol_id = ${protocolId} order by step_order`
    );
    expect(raw.rows.length).toBe(2);
    for (const row of raw.rows) {
      expect(row.deleted_at).not.toBeNull();
    }
  });

  afterAll(async () => {
    // Hard-delete fixture rows in reverse dependency order.
    if (protocolId) {
      await database.execute(
        sql`delete from interaction_logs where protocol_id = ${protocolId}`
      );
    }
    if (assignmentId) {
      await database.execute(
        sql`delete from protocol_assignments where id = ${assignmentId}`
      );
    }
    if (protocolId) {
      await database.execute(
        sql`delete from protocol_steps where protocol_id = ${protocolId}`
      );
      await database.execute(
        sql`delete from protocols where id = ${protocolId}`
      );
    }
    if (userId) {
      await database.execute(sql`delete from users where id = ${userId}`);
    }
    if (adminId) {
      await database.execute(sql`delete from admins where id = ${adminId}`);
    }
  });
});
