import { Hono } from 'hono';
import { z } from 'zod';
import { database } from '../core/database/connection.js';
import { UserRepository } from '../features/users/repository.js';
import { UserDomain } from '../features/users/domain.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery, validateParams, validateBody } from '../middleware/validation.js';
import { ResponseBuilder } from '../core/response/response-builder.js';

const users = new Hono();

// Initialize repositories and domain
const userRepository = new UserRepository();
const userDomain = new UserDomain(userRepository);

// Validation schemas
const UserQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
});

const UserParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

const UpdateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

const UpdateUserProfileSchema = z.object({
  realName: z.string().min(1).optional(),
  hospitalNumber: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  pictureUrl: z.string().url().optional(),
});

// Get all users
users.get('/', authMiddleware, validateQuery(UserQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  const users = await userDomain.getAllUsers(query);
  
  return ResponseBuilder.success(c, users);
});

// Get user statistics
users.get('/stats', authMiddleware, async (c) => {
  const stats = await userDomain.getUserStats();
  
  return ResponseBuilder.success(c, stats);
});

// Get user by ID
users.get('/:id', authMiddleware, validateParams(UserParamsSchema), async (c) => {
  const { id } = c.req.valid('param');
  
  const user = await userDomain.getUserById(id);
  if (!user) {
    return ResponseBuilder.notFound(c, 'User not found');
  }
  
  return ResponseBuilder.success(c, user);
});

// Update user status
users.put('/:id/status', authMiddleware, validateParams(UserParamsSchema), validateBody(UpdateUserStatusSchema), async (c) => {
  const { id } = c.req.valid('param');
  const { status } = c.req.valid('json');
  
  const user = await userDomain.updateUserStatus(id, status);
  if (!user) {
    return ResponseBuilder.notFound(c, 'User not found');
  }
  
  return ResponseBuilder.success(c, user);
});

// Update user profile
users.put('/:id/profile', authMiddleware, validateParams(UserParamsSchema), validateBody(UpdateUserProfileSchema), async (c) => {
  const { id } = c.req.valid('param');
  const updates = c.req.valid('json');
  
  const user = await userDomain.updateUserProfile(id, updates);
  if (!user) {
    return ResponseBuilder.notFound(c, 'User not found');
  }
  
  return ResponseBuilder.success(c, user);
});

export { users };