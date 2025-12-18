import { Hono } from 'hono';
import { AuthRepository } from '../features/auth/repository.js';
import { AuthDomain } from '../features/auth/domain.js';
import { LoginRequestSchema, RefreshTokenRequestSchema, ChangePasswordRequestSchema } from '../features/auth/interface.js';
import { validateBody } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { ResponseBuilder } from '../core/response/response-builder.js';

const auth = new Hono();

// Initialize repositories and domain
const authRepository = new AuthRepository();
const authDomain = new AuthDomain(authRepository);

// Login endpoint
auth.post('/login', validateBody(LoginRequestSchema), async (c) => {
  try {
    const credentials = c.req.valid('json');
    
    const result = await authDomain.login(credentials);
    
    return ResponseBuilder.success(c, result);
  } catch (error) {
    return ResponseBuilder.error(c, error as Error);
  }
});

// Get current admin info
auth.get('/me', authMiddleware, async (c) => {
  try {
    const adminPayload = c.get('admin');
    
    const admin = await authDomain.getCurrentAdmin(adminPayload.adminId);
    if (!admin) {
      return ResponseBuilder.notFound(c, 'Admin not found');
    }
    
    return ResponseBuilder.success(c, admin);
  } catch (error) {
    return ResponseBuilder.error(c, error as Error);
  }
});

// Refresh token endpoint
auth.post('/refresh', validateBody(RefreshTokenRequestSchema), async (c) => {
  try {
    const { token } = c.req.valid('json');
    
    const result = await authDomain.refreshToken(token);
    
    return ResponseBuilder.success(c, result);
  } catch (error) {
    return ResponseBuilder.error(c, error as Error);
  }
});

// Change password endpoint
auth.post('/change-password', authMiddleware, validateBody(ChangePasswordRequestSchema), async (c) => {
  try {
    const adminPayload = c.get('admin');
    const { currentPassword, newPassword } = c.req.valid('json');
    
    await authDomain.changePassword(adminPayload.adminId, currentPassword, newPassword);
    
    return ResponseBuilder.success(c, { message: 'Password changed successfully' });
  } catch (error) {
    return ResponseBuilder.error(c, error as Error);
  }
});

// Logout endpoint (client-side token invalidation)
auth.post('/logout', authMiddleware, async (c) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // For enhanced security, you could implement a token blacklist here
  return ResponseBuilder.success(c, { message: 'Logged out successfully' });
});

export { auth };