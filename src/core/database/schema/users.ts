import { z } from 'zod';
import { users } from '../schema.js';

// Manual Zod schemas
export const insertUserSchema = z.object({
  lineUserId: z.string().min(1),
  displayName: z.string().min(1),
  pictureUrl: z.string().url().optional(),
  realName: z.string().optional(),
  hospitalNumber: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const selectUserSchema = z.object({
  id: z.string().uuid(),
  lineUserId: z.string(),
  displayName: z.string(),
  pictureUrl: z.string().nullable(),
  realName: z.string().nullable(),
  hospitalNumber: z.string().nullable(),
  joinedAt: z.date(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CreateUserInput = z.infer<typeof insertUserSchema>;