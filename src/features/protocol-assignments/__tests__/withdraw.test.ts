import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { database } from '../../../core/database/connection.js';
import { sql } from 'drizzle-orm';
import { ValidationError } from '../../../core/errors/app-error.js';
import { JobManager } from '../../../core/jobs/queue.js';
import {
  admins,
  users,
  protocols,
  protocolAssignments
} from '../../../core/database/schema.js';
import { ProtocolAssignmentService } from '../domain.js';

describe('Protocol Assignment Withdraw', () => {
  let service: ProtocolAssignmentService;
  let adminId: string;
  let userId: string;
  // One protocol per assignment: protocol_assignments enforces
  // unique(user_id, protocol_id), so the three status fixtures cannot share one.
  let assignedProtocolId: string;
  let completedProtocolId: string;
  let pausedProtocolId: string;
  let assignedAssignmentId: string;
  let completedAssignmentId: string;
  let pausedAssignmentId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    service = new ProtocolAssignmentService();

    const [admin] = await database
      .insert(admins)
      .values({
        email: `withdraw-${stamp}@test.local`,
        passwordHash: 'hashed_password',
        name: 'Withdraw Test Admin',
        role: 'admin',
        isActive: true
      })
      .returning();
    adminId = admin.id;

    const [user] = await database
      .insert(users)
      .values({
        lineUserId: `withdraw-${stamp}`,
        displayName: 'Withdraw Test User',
        status: 'active'
      })
      .returning();
    userId = user.id;

    // status 'draft' so the minute-based scheduler never selects these fixtures.
    // Raw inserts instead of service.createAssignment so no welcome message is
    // ever queued or sent to LINE.
    const [assignedProtocol] = await database
      .insert(protocols)
      .values({
        name: `Withdraw Assigned ${stamp}`,
        description: 'fixture for withdraw tests',
        createdBy: adminId,
        status: 'draft'
      })
      .returning();
    assignedProtocolId = assignedProtocol.id;

    const [assignedAssignment] = await database
      .insert(protocolAssignments)
      .values({
        userId,
        protocolId: assignedProtocolId,
        status: 'assigned',
        totalSteps: 2
      })
      .returning();
    assignedAssignmentId = assignedAssignment.id;

    const [completedProtocol] = await database
      .insert(protocols)
      .values({
        name: `Withdraw Completed ${stamp}`,
        description: 'fixture for withdraw tests',
        createdBy: adminId,
        status: 'draft'
      })
      .returning();
    completedProtocolId = completedProtocol.id;

    const [completedAssignment] = await database
      .insert(protocolAssignments)
      .values({
        userId,
        protocolId: completedProtocolId,
        status: 'completed',
        completedAt: new Date(),
        totalSteps: 2
      })
      .returning();
    completedAssignmentId = completedAssignment.id;

    const [pausedProtocol] = await database
      .insert(protocols)
      .values({
        name: `Withdraw Paused ${stamp}`,
        description: 'fixture for withdraw tests',
        createdBy: adminId,
        status: 'draft'
      })
      .returning();
    pausedProtocolId = pausedProtocol.id;

    const [pausedAssignment] = await database
      .insert(protocolAssignments)
      .values({
        userId,
        protocolId: pausedProtocolId,
        status: 'paused',
        totalSteps: 2
      })
      .returning();
    pausedAssignmentId = pausedAssignment.id;
  });

  test('withdrawAssignment pauses an assigned assignment and keeps the row', async () => {
    // Redis is rate-limited in this environment, so the real cancelProtocolJobs
    // call rejects and the service guard is what actually runs here.
    const result = await service.withdrawAssignment(assignedAssignmentId);

    expect(result.id).toBe(assignedAssignmentId);
    expect(result.status).toBe('paused');

    const raw = await database.execute(
      sql`select status from protocol_assignments where id = ${assignedAssignmentId}`
    );
    const row = raw.rows[0];
    expect(row).toBeDefined();
    expect(row.status).toBe('paused');
  }, 30000);

  test('withdrawAssignment rejects completed assignments with ValidationError', async () => {
    await expect(
      service.withdrawAssignment(completedAssignmentId)
    ).rejects.toThrow(ValidationError);

    // The completed row is left untouched.
    const raw = await database.execute(
      sql`select status from protocol_assignments where id = ${completedAssignmentId}`
    );
    expect(raw.rows[0].status).toBe('completed');
  }, 30000);

  test('withdrawAssignment still succeeds when job cancellation rejects, and is idempotent for paused rows', async () => {
    // Force exactly what the rate-limited Redis does in this environment so the
    // guard path is exercised deterministically. Never fake a successful cancel,
    // and never queue or send any LINE message.
    const original = JobManager.cancelProtocolJobs;
    let cancelAttempts = 0;
    (JobManager as any).cancelProtocolJobs = async (_assignmentId: string) => {
      cancelAttempts += 1;
      throw new Error('ERR simulated: Redis unavailable');
    };

    try {
      const before = await service.getAssignmentById(pausedAssignmentId);
      const result = await service.withdrawAssignment(pausedAssignmentId);

      expect(cancelAttempts).toBe(1);
      expect(result.id).toBe(pausedAssignmentId);
      expect(result.status).toBe('paused');
      // Idempotent: an already-paused row is returned without an update.
      expect(result.updatedAt.getTime()).toBe(before.updatedAt.getTime());

      const raw = await database.execute(
        sql`select status from protocol_assignments where id = ${pausedAssignmentId}`
      );
      expect(raw.rows[0].status).toBe('paused');
    } finally {
      (JobManager as any).cancelProtocolJobs = original;
    }
  }, 30000);

  afterAll(async () => {
    // Hard-delete fixture rows in reverse dependency order.
    for (const pid of [assignedProtocolId, completedProtocolId, pausedProtocolId]) {
      if (pid) {
        await database.execute(
          sql`delete from protocol_assignments where protocol_id = ${pid}`
        );
        await database.execute(
          sql`delete from protocols where id = ${pid}`
        );
      }
    }
    if (userId) {
      await database.execute(sql`delete from users where id = ${userId}`);
    }
    if (adminId) {
      await database.execute(sql`delete from admins where id = ${adminId}`);
    }
  });
});
