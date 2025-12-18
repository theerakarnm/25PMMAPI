import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { database } from './core/database/connection.js';
import { errorMiddleware } from './middleware/error.js';
import { auth } from './routes/auth.js';
import { users } from './routes/users.js';
import { line } from './routes/line.js';
import protocols from './routes/protocols.js';
import { feedback } from './routes/feedback.js';
import { env } from './core/config/env.js';
import { ProtocolScheduler } from './core/jobs/scheduler.js';

const app = new Hono();

// Initialize job scheduler
ProtocolScheduler.initialize();

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
    database: 'connected',
    scheduler: 'running',
  });
});

// API routes
app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/line', line);
app.route('/api/protocols', protocols);
app.route('/api/feedback', feedback);

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

console.log(`Server is running on port ${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
