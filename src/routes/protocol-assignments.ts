import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ProtocolAssignmentService } from '../features/protocol-assignments/domain.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { requireAuth } from '../middleware/auth.js';

const app = new Hono();
const assignmentService = new ProtocolAssignmentService();

// Create assignment
app.post(
  '/',
  requireAuth,
  zValidator('json', z.object({
    userId: z.string().uuid(),
    protocolId: z.string().uuid(),
  })),
  async (c) => {
    try {
      const { userId, protocolId } = c.req.valid('json');
      
      const assignment = await assignmentService.createAssignment({
        userId,
        protocolId,
        assignedAt: new Date()
      });
      
      return c.json(ResponseBuilder.created(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Get all assignments with filters
app.get(
  '/',
  requireAuth,
  zValidator('query', z.object({
    status: z.enum(['assigned', 'active', 'completed', 'paused']).optional(),
    userId: z.string().uuid().optional(),
    protocolId: z.string().uuid().optional(),
  })),
  async (c) => {
    try {
      const filter = c.req.valid('query');
      const assignments = await assignmentService.getAssignments(filter);
      
      return c.json(ResponseBuilder.success(c, assignments));
    } catch (error) {
      throw error;
    }
  }
);

// Get assignments for a specific protocol
app.get(
  '/protocol/:protocolId',
  requireAuth,
  async (c) => {
    try {
      const protocolId = c.req.param('protocolId');
      const assignments = await assignmentService.getProtocolAssignments(protocolId);
      
      return c.json(ResponseBuilder.success(c, assignments));
    } catch (error) {
      throw error;
    }
  }
);

// Get assignments for a specific user
app.get(
  '/user/:userId',
  requireAuth,
  async (c) => {
    try {
      const userId = c.req.param('userId');
      const assignments = await assignmentService.getUserAssignments(userId);
      
      return c.json(ResponseBuilder.success(c, assignments));
    } catch (error) {
      throw error;
    }
  }
);

// Get assignment by ID
app.get(
  '/:id',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      const assignment = await assignmentService.getAssignmentById(id);
      
      return c.json(ResponseBuilder.success(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Start assignment
app.post(
  '/:id/start',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      const assignment = await assignmentService.startAssignment(id);
      
      return c.json(ResponseBuilder.success(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Pause assignment
app.post(
  '/:id/pause',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      const assignment = await assignmentService.pauseAssignment(id);
      
      return c.json(ResponseBuilder.success(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Resume assignment
app.post(
  '/:id/resume',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      const assignment = await assignmentService.resumeAssignment(id);
      
      return c.json(ResponseBuilder.success(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Complete assignment
app.post(
  '/:id/complete',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      const assignment = await assignmentService.completeAssignment(id);
      
      return c.json(ResponseBuilder.success(c, assignment));
    } catch (error) {
      throw error;
    }
  }
);

// Delete assignment
app.delete(
  '/:id',
  requireAuth,
  async (c) => {
    try {
      const id = c.req.param('id');
      await assignmentService.deleteAssignment(id);
      
      return c.json(ResponseBuilder.noContent(c));
    } catch (error) {
      throw error;
    }
  }
);

// Get assignment statistics
app.get(
  '/stats/overview',
  requireAuth,
  async (c) => {
    try {
      const stats = await assignmentService.getAssignmentStats();
      
      return c.json(ResponseBuilder.success(c, stats));
    } catch (error) {
      throw error;
    }
  }
);

// Get assignments with user and protocol details
app.get(
  '/details/all',
  requireAuth,
  async (c) => {
    try {
      const assignments = await assignmentService.getAssignmentsWithDetails();
      
      return c.json(ResponseBuilder.success(c, assignments));
    } catch (error) {
      throw error;
    }
  }
);

export default app;