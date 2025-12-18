import { eq, desc, count, isNull, and, asc, sql } from 'drizzle-orm';
import { database } from '../../core/database/connection.js';
import { 
  type Protocol, 
  type NewProtocol,
  type ProtocolStep,
  type NewProtocolStep,
  type FeedbackConfig
} from '../../core/database/schema/protocols.js';
import { DatabaseError } from '../../core/errors/app-error.js';
import { protocols, protocolSteps } from '../../core/database/schema.js';

export class ProtocolRepository {
  private db = database;

  async create(protocolData: Omit<NewProtocol, 'id' | 'createdAt' | 'updatedAt'>): Promise<Protocol> {
    try {
      const [protocol] = await this.db
        .insert(protocols)
        .values({
          name: protocolData.name,
          description: protocolData.description,
          createdBy: protocolData.createdBy,
          status: protocolData.status || 'draft',
        })
        .returning();

      if (!protocol) {
        throw new DatabaseError('Failed to create protocol');
      }

      return protocol;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Protocol creation failed', error);
    }
  }

  async findById(id: string): Promise<Protocol | null> {
    try {
      const [protocol] = await this.db
        .select()
        .from(protocols)
        .where(and(eq(protocols.id, id), isNull(protocols.deletedAt)))
        .limit(1);

      return protocol || null;
    } catch (error) {
      throw new DatabaseError('Failed to find protocol by ID', error);
    }
  }

  async findAll(filter: { 
    status?: 'draft' | 'active' | 'paused' | 'completed';
    createdBy?: string;
  } = {}): Promise<Protocol[]> {
    try {
      const conditions = [isNull(protocols.deletedAt)];
      
      if (filter.status) {
        conditions.push(eq(protocols.status, filter.status));
      }
      
      if (filter.createdBy) {
        conditions.push(eq(protocols.createdBy, filter.createdBy));
      }

      return await this.db
        .select()
        .from(protocols)
        .where(and(...conditions))
        .orderBy(desc(protocols.createdAt));
    } catch (error) {
      throw new DatabaseError('Failed to fetch protocols', error);
    }
  }

  async update(
    id: string, 
    updates: Partial<Pick<Protocol, 'name' | 'description' | 'status'>>
  ): Promise<Protocol | null> {
    try {
      const [protocol] = await this.db
        .update(protocols)
        .set({ 
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(eq(protocols.id, id), isNull(protocols.deletedAt)))
        .returning();

      return protocol || null;
    } catch (error) {
      throw new DatabaseError('Failed to update protocol', error);
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const [protocol] = await this.db
        .update(protocols)
        .set({ 
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(protocols.id, id), isNull(protocols.deletedAt)))
        .returning();

      return !!protocol;
    } catch (error) {
      throw new DatabaseError('Failed to delete protocol', error);
    }
  }

  async getActiveProtocolCount(): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(protocols)
        .where(and(eq(protocols.status, 'active'), isNull(protocols.deletedAt)));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count active protocols', error);
    }
  }

  // Protocol Steps methods
  async createStep(stepData: Omit<NewProtocolStep, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProtocolStep> {
    try {
      const [step] = await this.db
        .insert(protocolSteps)
        .values({
          protocolId: stepData.protocolId,
          stepOrder: stepData.stepOrder,
          triggerType: stepData.triggerType,
          triggerValue: stepData.triggerValue,
          messageType: stepData.messageType,
          contentPayload: stepData.contentPayload,
          requiresAction: stepData.requiresAction || false,
          feedbackConfig: stepData.feedbackConfig,
        })
        .returning();

      if (!step) {
        throw new DatabaseError('Failed to create protocol step');
      }

      return step;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Protocol step creation failed', error);
    }
  }

  async findStepsByProtocolId(protocolId: string): Promise<ProtocolStep[]> {
    try {
      return await this.db
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId))
        .orderBy(sql`CAST(${protocolSteps.stepOrder} AS INTEGER) ASC`);
    } catch (error) {
      throw new DatabaseError('Failed to fetch protocol steps', error);
    }
  }

  async findStepById(id: string): Promise<ProtocolStep | null> {
    try {
      const [step] = await this.db
        .select()
        .from(protocolSteps)
        .where(eq(protocolSteps.id, id))
        .limit(1);

      return step || null;
    } catch (error) {
      throw new DatabaseError('Failed to find protocol step by ID', error);
    }
  }

  async updateStep(
    id: string, 
    updates: Partial<Pick<ProtocolStep, 'stepOrder' | 'triggerType' | 'triggerValue' | 'messageType' | 'contentPayload' | 'requiresAction' | 'feedbackConfig'>>
  ): Promise<ProtocolStep | null> {
    try {
      const [step] = await this.db
        .update(protocolSteps)
        .set({ 
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(protocolSteps.id, id))
        .returning();

      return step || null;
    } catch (error) {
      throw new DatabaseError('Failed to update protocol step', error);
    }
  }

  async deleteStep(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(protocolSteps)
        .where(eq(protocolSteps.id, id));

      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete protocol step', error);
    }
  }

  async deleteStepsByProtocolId(protocolId: string): Promise<number> {
    try {
      const result = await this.db
        .delete(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseError('Failed to delete protocol steps', error);
    }
  }

  async getStepCountByProtocolId(protocolId: string): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(protocolSteps)
        .where(eq(protocolSteps.protocolId, protocolId));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count protocol steps', error);
    }
  }
}