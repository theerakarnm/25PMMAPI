import { eq, desc, count, isNull, and } from 'drizzle-orm';
import { database } from '../../core/database/connection.js';
import { type User, type CreateUserInput } from '../../core/database/schema/users.js';
import { DatabaseError } from '../../core/errors/app-error.js';
import { users } from '../../core/database/schema.js';

export class UserRepository {
  private db = database;

  async create(userData: CreateUserInput): Promise<User> {
    try {
      const [user] = await this.db
        .insert(users)
        .values({
          lineUserId: userData.lineUserId,
          displayName: userData.displayName,
          pictureUrl: userData.pictureUrl,
          realName: userData.realName,
          hospitalNumber: userData.hospitalNumber,
          status: userData.status || 'active',
        })
        .returning();

      if (!user) {
        throw new DatabaseError('Failed to create user');
      }

      return user;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('User creation failed', error);
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return user || null;
    } catch (error) {
      throw new DatabaseError('Failed to find user by ID', error);
    }
  }

  async findByLineUserId(lineUserId: string): Promise<User | null> {
    try {
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.lineUserId, lineUserId))
        .limit(1);

      return user || null;
    } catch (error) {
      throw new DatabaseError('Failed to find user by LINE user ID', error);
    }
  }

  async findAll(filter: { status?: 'active' | 'inactive' } = {}): Promise<User[]> {
    try {
      let query = this.db
        .select()
        .from(users)
        .where(and(isNull(users.deletedAt),
        filter.status ? eq(users.status, filter.status) : undefined)
      )
        .orderBy(desc(users.createdAt));

      return await query;
    } catch (error) {
      throw new DatabaseError('Failed to fetch users', error);
    }
  }

  async updateStatus(id: string, status: 'active' | 'inactive'): Promise<User | null> {
    try {
      const [user] = await this.db
        .update(users)
        .set({ 
          status,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      return user || null;
    } catch (error) {
      throw new DatabaseError('Failed to update user status', error);
    }
  }

  async updateProfile(
    id: string, 
    updates: Partial<Pick<User, 'realName' | 'hospitalNumber' | 'displayName' | 'pictureUrl'>>
  ): Promise<User | null> {
    try {
      const [user] = await this.db
        .update(users)
        .set({ 
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      return user || null;
    } catch (error) {
      throw new DatabaseError('Failed to update user profile', error);
    }
  }

  async getActiveUserCount(): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.status, 'active'));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count active users', error);
    }
  }

  async getTotalUserCount(): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(users)
        .where(isNull(users.deletedAt));

      return result?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to count total users', error);
    }
  }
}