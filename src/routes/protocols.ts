import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ProtocolService } from '../features/protocols/domain.js';
import { 
  createProtocolRequestSchema,
  updateProtocolRequestSchema,
  createProtocolStepRequestSchema,
  updateProtocolStepRequestSchema,
  protocolQuerySchema,
  type ProtocolResponse,
  type ProtocolStepResponse,
  type ProtocolValidationResponse,
  type ProtocolWithStepsResponse
} from '../features/protocols/interface.js';
import { ResponseBuilder } from '../core/response/response-builder.js';
import { AppError, ValidationError, NotFoundError } from '../core/errors/app-error.js';
import { authMiddleware } from '../middleware/auth.js';

const protocols = new Hono();
const protocolService = new ProtocolService();

// Apply authentication middleware to all protocol routes
protocols.use('*', authMiddleware);

// GET /protocols - List all protocols with optional filtering
protocols.get(
  '/',
  zValidator('query', protocolQuerySchema),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const protocolList = await protocolService.getProtocols(query);
      
      const response: ProtocolResponse[] = protocolList.map(protocol => ({
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
      }));

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch protocols');
    }
  }
);

// POST /protocols - Create a new protocol
protocols.post(
  '/',
  zValidator('json', createProtocolRequestSchema),
  async (c) => {
    try {
      const data = c.req.valid('json');
      const protocol = await protocolService.createProtocol(data);
      
      const response: ProtocolResponse = {
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
      };

      return ResponseBuilder.created(c, response);
    } catch (error) {
      if (error instanceof ValidationError) {
        return ResponseBuilder.badRequest(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to create protocol');
    }
  }
);

// GET /protocols/:id - Get a specific protocol
protocols.get(
  '/:id',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const protocol = await protocolService.getProtocolById(id);
      
      const response: ProtocolResponse = {
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch protocol');
    }
  }
);

// PUT /protocols/:id - Update a protocol
protocols.put(
  '/:id',
  zValidator('param', z.object({ id: z.string().uuid() })),
  zValidator('json', updateProtocolRequestSchema),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const updates = c.req.valid('json');
      const protocol = await protocolService.updateProtocol(id, updates);
      
      const response: ProtocolResponse = {
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof ValidationError) {
        return ResponseBuilder.badRequest(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to update protocol');
    }
  }
);

// DELETE /protocols/:id - Delete a protocol
protocols.delete(
  '/:id',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      await protocolService.deleteProtocol(id);
      
      return ResponseBuilder.success(c, { message: 'Protocol deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to delete protocol');
    }
  }
);

// POST /protocols/:id/activate - Activate a protocol
protocols.post(
  '/:id/activate',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const protocol = await protocolService.activateProtocol(id);
      
      const response: ProtocolResponse = {
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof ValidationError) {
        return ResponseBuilder.badRequest(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to activate protocol');
    }
  }
);

// GET /protocols/:id/validate - Validate a protocol
protocols.get(
  '/:id/validate',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const validation = await protocolService.validateProtocol(id);
      
      const response: ProtocolValidationResponse = {
        isValid: validation.isValid,
        errors: validation.errors,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to validate protocol');
    }
  }
);

// GET /protocols/:id/with-steps - Get protocol with all steps
protocols.get(
  '/:id/with-steps',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const protocol = await protocolService.getProtocolById(id);
      const steps = await protocolService.getProtocolSteps(id);
      
      const response: ProtocolWithStepsResponse = {
        id: protocol.id,
        name: protocol.name,
        description: protocol.description,
        createdBy: protocol.createdBy,
        status: protocol.status,
        createdAt: protocol.createdAt,
        updatedAt: protocol.updatedAt,
        deletedAt: protocol.deletedAt,
        steps: steps.map(step => ({
          id: step.id,
          protocolId: step.protocolId,
          stepOrder: step.stepOrder,
          triggerType: step.triggerType,
          triggerValue: step.triggerValue,
          messageType: step.messageType,
          contentPayload: step.contentPayload,
          requiresAction: step.requiresAction,
          feedbackConfig: step.feedbackConfig,
          createdAt: step.createdAt,
          updatedAt: step.updatedAt,
        })),
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch protocol with steps');
    }
  }
);

// Protocol Steps endpoints

// GET /protocols/:id/steps - Get all steps for a protocol
protocols.get(
  '/:id/steps',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const steps = await protocolService.getProtocolSteps(id);
      
      const response: ProtocolStepResponse[] = steps.map(step => ({
        id: step.id,
        protocolId: step.protocolId,
        stepOrder: step.stepOrder,
        triggerType: step.triggerType,
        triggerValue: step.triggerValue,
        messageType: step.messageType,
        contentPayload: step.contentPayload,
        requiresAction: step.requiresAction,
        feedbackConfig: step.feedbackConfig,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt,
      }));

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch protocol steps');
    }
  }
);

// POST /protocols/:id/steps - Create a new step for a protocol
protocols.post(
  '/:id/steps',
  zValidator('param', z.object({ id: z.string().uuid() })),
  zValidator('json', createProtocolStepRequestSchema.omit({ protocolId: true })),
  async (c) => {
    try {
      const { id } = c.req.valid('param');
      const stepData = c.req.valid('json');
      
      const step = await protocolService.createProtocolStep({
        ...stepData,
        protocolId: id,
        contentPayload: stepData.contentPayload || {},
      });
      
      const response: ProtocolStepResponse = {
        id: step.id,
        protocolId: step.protocolId,
        stepOrder: step.stepOrder,
        triggerType: step.triggerType,
        triggerValue: step.triggerValue,
        messageType: step.messageType,
        contentPayload: step.contentPayload,
        requiresAction: step.requiresAction,
        feedbackConfig: step.feedbackConfig,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt,
      };

      return ResponseBuilder.created(c, response);
    } catch (error) {
      if (error instanceof ValidationError) {
        return ResponseBuilder.badRequest(c, error.message);
      }
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to create protocol step');
    }
  }
);

// GET /protocols/:protocolId/steps/:stepId - Get a specific protocol step
protocols.get(
  '/:protocolId/steps/:stepId',
  zValidator('param', z.object({ 
    protocolId: z.string().uuid(),
    stepId: z.string().uuid()
  })),
  async (c) => {
    try {
      const { stepId } = c.req.valid('param');
      const step = await protocolService.getProtocolStepById(stepId);
      
      const response: ProtocolStepResponse = {
        id: step.id,
        protocolId: step.protocolId,
        stepOrder: step.stepOrder,
        triggerType: step.triggerType,
        triggerValue: step.triggerValue,
        messageType: step.messageType,
        contentPayload: step.contentPayload,
        requiresAction: step.requiresAction,
        feedbackConfig: step.feedbackConfig,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to fetch protocol step');
    }
  }
);

// PUT /protocols/:protocolId/steps/:stepId - Update a protocol step
protocols.put(
  '/:protocolId/steps/:stepId',
  zValidator('param', z.object({ 
    protocolId: z.string().uuid(),
    stepId: z.string().uuid()
  })),
  zValidator('json', updateProtocolStepRequestSchema),
  async (c) => {
    try {
      const { stepId } = c.req.valid('param');
      const updates = c.req.valid('json');
      const step = await protocolService.updateProtocolStep(stepId, updates);
      
      const response: ProtocolStepResponse = {
        id: step.id,
        protocolId: step.protocolId,
        stepOrder: step.stepOrder,
        triggerType: step.triggerType,
        triggerValue: step.triggerValue,
        messageType: step.messageType,
        contentPayload: step.contentPayload,
        requiresAction: step.requiresAction,
        feedbackConfig: step.feedbackConfig,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt,
      };

      return ResponseBuilder.success(c, response);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof ValidationError) {
        return ResponseBuilder.badRequest(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to update protocol step');
    }
  }
);

// DELETE /protocols/:protocolId/steps/:stepId - Delete a protocol step
protocols.delete(
  '/:protocolId/steps/:stepId',
  zValidator('param', z.object({ 
    protocolId: z.string().uuid(),
    stepId: z.string().uuid()
  })),
  async (c) => {
    try {
      const { stepId } = c.req.valid('param');
      await protocolService.deleteProtocolStep(stepId);
      
      return ResponseBuilder.success(c, { message: 'Protocol step deleted successfully' });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return ResponseBuilder.notFound(c, error.message);
      }
      if (error instanceof AppError) {
        return ResponseBuilder.error(c, error);
      }
      return ResponseBuilder.internalError(c, 'Failed to delete protocol step');
    }
  }
);

export default protocols;