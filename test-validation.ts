// Quick test to verify zValidator is working
import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from './src/middleware/validation.js';

const app = new Hono();

const TestSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const QuerySchema = z.object({
  filter: z.string().optional(),
});

const ParamSchema = z.object({
  id: z.string().uuid(),
});

// Test routes
app.post('/test', validateBody(TestSchema), (c) => {
  const data = c.req.valid('json');
  return c.json({ success: true, data });
});

app.get('/test', validateQuery(QuerySchema), (c) => {
  const query = c.req.valid('query');
  return c.json({ success: true, query });
});

app.get('/test/:id', validateParams(ParamSchema), (c) => {
  const params = c.req.valid('param');
  return c.json({ success: true, params });
});

console.log('Validation middleware test setup complete');