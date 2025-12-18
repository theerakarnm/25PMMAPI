import { eq, desc, count, isNull, and, avg, sql } from 'drizzle-orm';
import { database } from '../../core/database/connection.js';
import { 
  type ProtocolAssignment, 
  type NewProtocolAssignment
} from '../../core/database/schema/protocol-assignments.js';
import { DatabaseError } from '../../core/errors/app-error.js';
import { protocolAssignments, users, protocols } from '../../core/database/schema.js';

export class ProtocolAssignmentRepository {
  private db = database;

  async create(assignmentData: Omit<NewProtocolAssignment, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProtocolAssignment> {
    try {
      const [assignment] = await this.db
        .insert(protocolAssignments)
        .values({
          userId: assignmentData.userId,
          protocolId: assignmentData.protocolId,
          assignedAt: assignmentData.assignedAt || new Date(),
          startedAt: assignmentData.startedAt,
          completedAt: assignmentData.completedAt,
          currentStep: assignmentData.currentStep || 0,
          status: assignmentData.status || 'assigned',
          totalSteps: assignmentData.totalSteps || 0,
          completedSteps: assignmentData.completedSteps || 0,
          adherenceRate: assignmentData.adherenceRate || '0.00',
        })
        .returning();

      if (!assignment) {
        throw new DatabaseError('Failed to create protocol assignment');
      }

      return assignment;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Protocol assignment creation failed', error);
    }
  }

  async findById(id: string): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .select()
        .from(protocolAssignments)
        .where(eq(protocolAssignments.id, id))
        .limit(1);

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to find protocol assignment by ID', error);
    }
  }

  async findByUserAndProtocol(userId: string, protocolId: string): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .select()
        .from(protocolAssignments)
        .where(and(
          eq(protocolAssignments.userId, userId),
          eq(protocolAssignments.protocolId, protocolId)
        ))
        .limit(1);

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to find protocol assignment by user and protocol', error);
    }
  }

  async findByUserId(userId: string): Promise<ProtocolAssignment[]> {
    try {
      return await this.db
        .select()
        .from(protocolAssignments)
        .where(eq(protocolAssignments.userId, userId))
        .orderBy(desc(protocolAssignments.assignedAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch protocol assignments by user ID', error);
    }
  }

  async findByProtocolId(protocolId: string): Promise<ProtocolAssignment[]> {
    try {
      return await this.db
        .select()
        .from(protocolAssignments)
        .where(eq(protocolAssignments.protocolId, protocolId))
        .orderBy(desc(protocolAssignments.assignedAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch protocol assignments by protocol ID', error);
    }
  }

  async findAll(filter: { 
    status?: 'assigned' | 'active' | 'completed' | 'paused';
    userId?: string;
    protocolId?: string;
  } = {}): Promise<ProtocolAssignment[]> {
    try {
      const conditions = [];
      
      if (filter.status) {
        conditions.push(eq(protocolAssignments.status, filter.status));
      }
      
      if (filter.userId) {
        conditions.push(eq(protocolAssignments.userId, filter.userId));
      }
      
      if (filter.protocolId) {
        conditions.push(eq(protocolAssignments.protocolId, filter.protocolId));
      }

      return await this.db
        .select()
        .from(protocolAssignments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(protocolAssignments.assignedAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch protocol assignments', error);
    }
  }

  async update(
    id: string, 
    updates: Partial<Pick<ProtocolAssignment, 'startedAt' | 'completedAt' | 'currentStep' | 'status' | 'totalSteps' | 'completedSteps' | 'adherenceRate'>>
  ): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .update(protocolAssignments)
        .set({ 
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, id))
        .returning();

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to update protocol assignment', error);
    }
  }

  async updateProgress(
    id: string, 
    currentStep: number, 
    completedSteps: number, 
    adherenceRate: string
  ): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .update(protocolAssignments)
        .set({ 
          currentStep,
          completedSteps,
          adherenceRate,
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, id))
        .returning();

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to update protocol assignment progress', error);
    }
  }

  async markAsStarted(id: string): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .update(protocolAssignments)
        .set({ 
          status: 'active',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, id))
        .returning();

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to mark protocol assignment as started', error);
    }
  }

  async markAsCompleted(id: string): Promise<ProtocolAssignment | null> {
    try {
      const [assignment] = await this.db
        .update(protocolAssignments)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(protocolAssignments.id, id))
        .returning();

      return assignment || null;
    } catch (error) {
      throw new DatabaseError('Failed to mark protocol assignment as completed', error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(protocolAssignments)
        .where(eq(protocolAssignments.id, id));

      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete protocol assignment', error);
    }
  }

  async getAssignmentCountByStatus(status: 'assigned' | 'active' | 'completed' | 'paused'): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(protocolAssignments)
        .where(eq(protocolAssignments.status, status));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count protocol assignments by status', error);
    }
  }

  async getAverageAdherenceRate(): Promise<number> {
    try {
      const [result] = await this.db
        .select({ 
          avgRate: avg(sql`CAST(${protocolAssignments.adherenceRate} AS DECIMAL)`) 
        })
        .from(protocolAssignments)
        .where(eq(protocolAssignments.status, 'active'));

      return Number(result?.avgRate) || 0;
    } catch (error) {
      throw new DatabaseError('Failed to calculate average adherence rate', error);
    }
  }

  async getAssignmentsWithUserAndProtocol(): Promise<Array<ProtocolAssignment & { 
    user: { displayName: string; realName: string | null } | null; 
    protocol: { name: string } | null;
  }>> {
    try {
      return await this.db
        .select({
          id: protocolAssignments.id,
          userId: protocolAssignments.userId,
          protocolId: protocolAssignments.protocolId,
          assignedAt: protocolAssignments.assignedAt,
          startedAt: protocolAssignments.startedAt,
          completedAt: protocolAssignments.completedAt,
          currentStep: protocolAssignments.currentStep,
          status: protocolAssignments.status,
          totalSteps: protocolAssignments.totalSteps,
          completedSteps: protocolAssignments.completedSteps,
          adherenceRate: protocolAssignments.adherenceRate,
          createdAt: protocolAssignments.createdAt,
          updatedAt: protocolAssignments.updatedAt,
          user: {
            displayName: users.displayName,
            realName: users.realName,
          },
          protocol: {
            name: protocols.name,
          },
        })
        .from(protocolAssignments)
        .leftJoin(users, eq(protocolAssignments.userId, users.id))
        .leftJoin(protocols, eq(protocolAssignments.protocolId, protocols.id))
        .orderBy(desc(protocolAssignments.assignedAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch assignments with user and protocol data', error);
    }
  }
}