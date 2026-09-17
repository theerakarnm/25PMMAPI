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
import { ProtocolService } from '../domain.js';

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

  test('updateProtocol with steps atomically replaces the live step set, resyncs assignment totalSteps, and preserves interaction logs', async () => {
    const service = new ProtocolService();

    // An interaction log anchored to step 1. Before the atomic replacement this
    // row's step_id reference was destroyed by the old delete-all-then-recreate flow.
    await database.insert(interactionLogs).values({
      userId,
      protocolId,
      stepId: step1Id,
      assignmentId,
      sentAt: new Date(),
    });

    const stepPayload = (text: string) => ({
      triggerType: 'immediate' as const,
      triggerValue: '0',
      messageType: 'text' as const,
      contentPayload: { text },
    });
    const result = await service.updateProtocol(
      protocolId,
      { name: `Renamed ${Date.now()}` },
      [stepPayload('first'), stepPayload('second'), stepPayload('third')]
    );

    expect(result.steps.length).toBe(3);

    // 2 original rows soft-deleted + 3 fresh live rows.
    const rawAll = await database.execute(
      sql`select id, step_order, deleted_at from protocol_steps where protocol_id = ${protocolId}`
    );
    expect(rawAll.rows.length).toBe(5);

    const liveCount = await repo.getStepCountByProtocolId(protocolId);
    expect(liveCount).toBe(3);

    // The interaction log still resolves its original step_id.
    const logRows = await database.execute(
      sql`select id from interaction_logs where step_id = ${step1Id}`
    );
    expect(logRows.rows.length).toBe(1);

    const assignmentRows = await database.execute(
      sql`select total_steps from protocol_assignments where id = ${assignmentId}`
    );
    expect(Number(assignmentRows.rows[0].total_steps)).toBe(3);

    expect(result.steps.map(s => s.stepOrder)).toEqual(['1', '2', '3']);
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
