import { Hono } from 'hono';
import { AuthRepository } from '../features/auth/repository.js';
import { AuthDomain } from '../features/auth/domain.js';
import { LoginRequestSchema } from '../features/auth/interface.js';
import { validateBody } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { ResponseBuilder } from '../core/response/response-builder.js';

const auth = new Hono();

// Initialize repositories and domain
const authRepository = new AuthRepository();
const authDomain = new AuthDomain(authRepository);

// Login endpoint
auth.post('/login', validateBody(LoginRequestSchema), async (c) => {
  const credentials = c.req.valid('json');
  
  const result = await authDomain.login(credentials);
  
  return ResponseBuilder.success(c, result);
});

// Get current admin info
auth.get('/me', authMiddleware, async (c) => {
  const adminPayload = c.get('admin');
  
  const admin = await authDomain.getCurrentAdmin(adminPayload.adminId);
  if (!admin) {
    return ResponseBuilder.notFound(c, 'Admin not found');
  }
  
  return ResponseBuilder.success(c, admin);
});

// Logout endpoint (client-side token invalidation)
auth.post('/logout', authMiddleware, async (c) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // For enhanced security, you could implement a token blacklist here
  return ResponseBuilder.success(c, { message: 'Logged out successfully' });
});

export { auth };