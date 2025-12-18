import { type Admin, type LoginRequest } from '../../core/database/schema/admins.js';
import { JwtService } from '../../core/auth/jwt.js';
import { AuthRepository } from './repository.js';

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
}