import { ProtocolRepository } from './repository.js';
import { 
  type Protocol, 
  type ProtocolStep,
  type FeedbackConfig,
  insertProtocolSchema,
  insertProtocolStepSchema
} from '../../core/database/schema/protocols.js';
import { ValidationError, NotFoundError } from '../../core/errors/app-error.js';

export class ProtocolService {
  private protocolRepo = new ProtocolRepository();

  async createProtocol(data: {
    name: string;
    description?: string;
    createdBy: string;
    status?: 'draft' | 'active' | 'paused' | 'completed';
  }): Promise<Protocol> {
    const validatedData = insertProtocolSchema.parse(data);
    return await this.protocolRepo.create(validatedData);
  }

  async getProtocolById(id: string): Promise<Protocol> {
    const protocol = await this.protocolRepo.findById(id);
    if (!protocol) {
      throw new NotFoundError('Protocol not found');
    }
    return protocol;
  }

  async getProtocols(filter?: {
    status?: 'draft' | 'active' | 'paused' | 'completed';
    createdBy?: string;
  }): Promise<Protocol[]> {
    return await this.protocolRepo.findAll(filter);
  }

  async updateProtocol(
    id: string, 
    updates: Partial<Pick<Protocol, 'name' | 'description' | 'status'>>
  ): Promise<Protocol> {
    const protocol = await this.protocolRepo.update(id, updates);
    if (!protocol) {
      throw new NotFoundError('Protocol not found');
    }
    return protocol;
  }

  async deleteProtocol(id: string): Promise<void> {
    const deleted = await this.protocolRepo.delete(id);
    if (!deleted) {
      throw new NotFoundError('Protocol not found');
    }
  }

  async activateProtocol(id: string): Promise<Protocol> {
    // Validate protocol has steps before activation
    const steps = await this.protocolRepo.findStepsByProtocolId(id);
    if (steps.length === 0) {
      throw new ValidationError('Cannot activate protocol without steps');
    }

    return await this.updateProtocol(id, { status: 'active' });
  }

  // Protocol Steps methods
  async createProtocolStep(data: {
    protocolId: string;
    stepOrder: string;
    triggerType: 'immediate' | 'delay' | 'scheduled';
    triggerValue: string;
    messageType: 'text' | 'image' | 'link' | 'flex';
    contentPayload: any;
    requiresAction?: boolean;
    feedbackConfig?: FeedbackConfig;
  }): Promise<ProtocolStep> {
    const validatedData = insertProtocolStepSchema.parse(data);
    
    // Validate protocol exists
    await this.getProtocolById(data.protocolId);
    
    return await this.protocolRepo.createStep(validatedData);
  }

  async getProtocolSteps(protocolId: string): Promise<ProtocolStep[]> {
    // Validate protocol exists
    await this.getProtocolById(protocolId);
    
    return await this.protocolRepo.findStepsByProtocolId(protocolId);
  }

  async getProtocolStepById(id: string): Promise<ProtocolStep> {
    const step = await this.protocolRepo.findStepById(id);
    if (!step) {
      throw new NotFoundError('Protocol step not found');
    }
    return step;
  }

  async updateProtocolStep(
    id: string, 
    updates: Partial<Pick<ProtocolStep, 'stepOrder' | 'triggerType' | 'triggerValue' | 'messageType' | 'contentPayload' | 'requiresAction' | 'feedbackConfig'>>
  ): Promise<ProtocolStep> {
    const step = await this.protocolRepo.updateStep(id, updates);
    if (!step) {
      throw new NotFoundError('Protocol step not found');
    }
    return step;
  }

  async deleteProtocolStep(id: string): Promise<void> {
    const deleted = await this.protocolRepo.deleteStep(id);
    if (!deleted) {
      throw new NotFoundError('Protocol step not found');
    }
  }

  async validateProtocol(id: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const protocol = await this.getProtocolById(id);
    const steps = await this.protocolRepo.findStepsByProtocolId(id);
    
    const errors: string[] = [];
    
    // Check if protocol has steps
    if (steps.length === 0) {
      errors.push('Protocol must have at least one step');
    }
    
    // Check step ordering - convert string to number for validation
    const stepOrders = steps.map(s => parseInt(s.stepOrder)).sort((a, b) => a - b);
    for (let i = 0; i < stepOrders.length; i++) {
      if (stepOrders[i] !== i + 1) {
        errors.push(`Step order must be sequential starting from 1. Missing step ${i + 1}`);
        break;
      }
    }
    
    // Validate each step
    for (const step of steps) {
      // Validate trigger configuration
      if (step.triggerType === 'delay' && !step.triggerValue.match(/^\d+[smhd]$/)) {
        errors.push(`Step ${step.stepOrder}: Invalid delay format. Use format like '30m', '2h', '1d'`);
      }
      
      if (step.triggerType === 'scheduled' && !step.triggerValue.match(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
        errors.push(`Step ${step.stepOrder}: Invalid scheduled time format. Use HH:MM format`);
      }
      
      // Validate content payload
      if (!step.contentPayload || (typeof step.contentPayload === 'object' && Object.keys(step.contentPayload).length === 0)) {
        errors.push(`Step ${step.stepOrder}: Content payload is required`);
      }
      
      // Validate feedback configuration if action is required
      if (step.requiresAction && !step.feedbackConfig) {
        errors.push(`Step ${step.stepOrder}: Feedback configuration is required when action is required`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getActiveProtocolCount(): Promise<number> {
    return await this.protocolRepo.getActiveProtocolCount();
  }

  async getProtocolStepCount(protocolId: string): Promise<number> {
    return await this.protocolRepo.getStepCountByProtocolId(protocolId);
  }
}