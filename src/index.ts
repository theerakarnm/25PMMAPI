import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { database } from './core/database/connection.js';
import { errorMiddleware } from './middleware/error.js';
import { auth } from './routes/auth.js';
import { users } from './routes/users.js';
import { env } from './core/config/env.js';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
  credentials: true,
}));
app.use('*', errorMiddleware);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// API routes
app.route('/api/auth', auth);
app.route('/api/users', users);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
    meta: {
      timestamp: new Date().toISOString(),
      path: c.req.path,
      method: c.req.method,
    },
  }, 404);
});

export default app