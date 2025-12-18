import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { database } from '../../core/database/connection.js';
import { type Admin, type CreateAdmin } from '../../core/database/schema/admins.js';
import { DatabaseError, InvalidCredentialsError } from '../../core/errors/app-error.js';
import { admins } from '../../core/database/schema.js';

export class AuthRepository {
  private db = database;

  async createAdmin(adminData: CreateAdmin): Promise<Admin> {
    try {
      const passwordHash = await bcrypt.hash(adminData.password, 12);
      
      const [admin] = await this.db
        .insert(admins)
        .values({
          email: adminData.email,
          passwordHash,
          name: adminData.name,
          role: adminData.role || 'admin',
          isActive: adminData.isActive ?? true,
        })
        .returning();

      if (!admin) {
        throw new DatabaseError('Failed to create admin');
      }

      return admin;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Admin creation failed', error);
    }
  }

  async findByEmail(email: string): Promise<Admin | null> {
    try {
      const [admin] = await this.db
        .select()
        .from(admins)
        .where(eq(admins.email, email))
        .limit(1);

      return admin || null;
    } catch (error) {
      throw new DatabaseError('Failed to find admin by email', error);
    }
  }

  async findById(id: string): Promise<Admin | null> {
    try {
      const [admin] = await this.db
        .select()
        .from(admins)
        .where(eq(admins.id, id))
        .limit(1);

      return admin || null;
    } catch (error) {
      throw new DatabaseError('Failed to find admin by ID', error);
    }
  }

  async validateCredentials(email: string, password: string): Promise<Admin> {
    try {
      const admin = await this.findByEmail(email);
      if (!admin || !admin.isActive) {
        throw new InvalidCredentialsError();
      }

      const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!isValidPassword) {
        throw new InvalidCredentialsError();
      }

      // Update last login
      await this.db
        .update(admins)
        .set({ 
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admins.id, admin.id));

      return admin;
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw error;
      throw new DatabaseError('Credential validation failed', error);
    }
  }

  async updateLastLogin(adminId: string): Promise<void> {
    try {
      await this.db
        .update(admins)
        .set({ 
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admins.id, adminId));
    } catch (error) {
      throw new DatabaseError('Failed to update last login', error);
    }
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const admin = await this.findById(adminId);
      if (!admin) {
        throw new InvalidCredentialsError('Admin not found');
      }

      const isValidPassword = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!isValidPassword) {
        throw new InvalidCredentialsError('Current password is incorrect');
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      
      await this.db
        .update(admins)
        .set({ 
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        })
        .where(eq(admins.id, adminId));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw error;
      throw new DatabaseError('Password change failed', error);
    }
  }
}