import { type User, type CreateUserInput } from '../../core/database/schema/users.js';
import { UserRepository } from './repository.js';

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
}

export class UserDomain {
  constructor(private userRepository: UserRepository) {}

  async createUser(userData: CreateUserInput): Promise<User> {
    // Check if user already exists with this LINE user ID
    const existingUser = await this.userRepository.findByLineUserId(userData.lineUserId);
    if (existingUser) {
      // If user exists but is inactive, reactivate them
      if (existingUser.status === 'inactive') {
        const reactivatedUser = await this.userRepository.updateStatus(existingUser.id, 'active');
        if (reactivatedUser) {
          return reactivatedUser;
        }
      }
      return existingUser;
    }

    return await this.userRepository.create(userData);
  }

  async getUserById(id: string): Promise<User | null> {
    return await this.userRepository.findById(id);
  }

  async getUserByLineUserId(lineUserId: string): Promise<User | null> {
    return await this.userRepository.findByLineUserId(lineUserId);
  }

  async getAllUsers(filter?: { status?: 'active' | 'inactive' }): Promise<User[]> {
    return await this.userRepository.findAll(filter);
  }

  async updateUserStatus(id: string, status: 'active' | 'inactive'): Promise<User | null> {
    return await this.userRepository.updateStatus(id, status);
  }

  async updateUserProfile(
    id: string, 
    updates: Partial<Pick<User, 'realName' | 'hospitalNumber' | 'displayName' | 'pictureUrl'>>
  ): Promise<User | null> {
    return await this.userRepository.updateProfile(id, updates);
  }

  async getUserStats(): Promise<UserStats> {
    const [totalUsers, activeUsers] = await Promise.all([
      this.userRepository.getTotalUserCount(),
      this.userRepository.getActiveUserCount(),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
    };
  }

  async deactivateUser(lineUserId: string): Promise<User | null> {
    const user = await this.userRepository.findByLineUserId(lineUserId);
    if (!user) {
      return null;
    }

    return await this.userRepository.updateStatus(user.id, 'inactive');
  }
}