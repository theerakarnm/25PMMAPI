import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshTokenRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
export type RefreshTokenRequestDto = z.infer<typeof RefreshTokenRequestSchema>;
export type ChangePasswordRequestDto = z.infer<typeof ChangePasswordRequestSchema>;