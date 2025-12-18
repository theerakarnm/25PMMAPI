import { type Admin, type LoginRequest } from '../../core/database/schema/admins.js';
import { JwtService } from '../../core/auth/jwt.js';
import { AuthRepository } from './repository.js';
import { InvalidCredentialsError, SessionExpiredError } from '../../core/errors/app-error.js';

export interface LoginResponse {
  admin: Omit<Admin, 'passwordHash'>;
  token: string;
}

export class AuthDomain {
  constructor(private authRepository: AuthRepository) {}

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const admin = await this.authRepository.validateCredentials(
      credentials.email,
      credentials.password
    );

    const token = JwtService.generateToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    // Remove password hash from response
    const { passwordHash, ...adminWithoutPassword } = admin;

    return {
      admin: adminWithoutPassword,
      token,
    };
  }

  async validateToken(token: string): Promise<Omit<Admin, 'passwordHash'> | null> {
    try {
      const payload = JwtService.verifyToken(token);
      const admin = await this.authRepository.findById(payload.adminId);
      
      if (!admin) {
        return null;
      }

      const { passwordHash, ...adminWithoutPassword } = admin;
      return adminWithoutPassword;
    } catch (error) {
      return null;
    }
  }

  async getCurrentAdmin(adminId: string): Promise<Omit<Admin, 'passwordHash'> | null> {
    const admin = await this.authRepository.findById(adminId);
    if (!admin) {
      return null;
    }

    const { passwordHash, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }

  async refreshToken(token: string): Promise<LoginResponse> {
    const payload = JwtService.verifyToken(token);
    const admin = await this.authRepository.findById(payload.adminId);
    
    if (!admin || !admin.isActive) {
      throw new Error('Invalid token or inactive admin');
    }

    // Update last login
    await this.authRepository.updateLastLogin(admin.id);

    const newToken = JwtService.generateToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    const { passwordHash, ...adminWithoutPassword } = admin;

    return {
      admin: adminWithoutPassword,
      token: newToken,
    };
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    await this.authRepository.changePassword(adminId, currentPassword, newPassword);
  }
}