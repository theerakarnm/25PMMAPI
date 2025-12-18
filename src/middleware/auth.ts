import { Context, Next } from 'hono';
import { JwtService, JwtPayload } from '../core/auth/jwt.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { UnauthorizedAccessError } from '../core/errors/app-error.js';

declare module 'hono' {
  interface ContextVariableMap {
    admin: JwtPayload;
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = JwtService.extractTokenFromHeader(authHeader);
    const payload = JwtService.verifyToken(token);
    
    c.set('admin', payload);
    await next();
  } catch (error) {
    if (error instanceof UnauthorizedAccessError) {
      return ResponseBuilder.unauthorized(c, error.message);
    }
    return ResponseBuilder.unauthorized(c, 'Authentication required');
  }
};

export const optionalAuthMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const token = JwtService.extractTokenFromHeader(authHeader);
      const payload = JwtService.verifyToken(token);
      c.set('admin', payload);
    }
    await next();
  } catch (error) {
    // For optional auth, we don't return errors, just continue without setting admin
    await next();
  }
};