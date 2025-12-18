import { ProtocolAssignmentRepository } from './repository.js';
import { ProtocolRepository } from '../protocols/repository.js';
import { UserRepository } from '../users/repository.js';
import { 
  type ProtocolAssignment,
  insertProtocolAssignmentSchema
} from '../../core/database/schema/protocol-assignments.js';
import { ValidationError, NotFoundError, ConflictError } from '../../core/errors/app-error.js';

export class ProtocolAssignmentService {
  private assignmentRepo = new ProtocolAssignmentRepository();
  private protocolRepo = new ProtocolRepository();
  private userRepo = new UserRepository();

  async createAssignment(data: {
    userId: string;
    protocolId: string;
    assignedAt?: Date;
  }): Promise<ProtocolAssignment> {
    // Validate user exists
    const user = await this.userRepo.findById(data.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Validate protocol exists and is active
    const protocol = await this.protocolRepo.findById(data.protocolId);
    if (!protocol) {
      throw new NotFoundError('Protocol not found');
    }
    
    if (protocol.status !== 'active') {
      throw new ValidationError('Can only assign active protocols');
    }

    // Check if assignment already exists
    const existingAssignment = await this.assignmentRepo.findByUserAndProtocol(
      data.userId, 
      data.protocolId
    );
    if (existingAssignment) {
      throw new ConflictError('User is already assigned to this protocol');
    }

    // Get protocol step count for totalSteps
    const stepCount = await this.protocolRepo.getStepCountByProtocolId(data.protocolId);

    const validatedData = insertProtocolAssignmentSchema.parse({
      ...data,
      totalSteps: stepCount,
    });

    return await this.assignmentRepo.create(validatedData);
  }

  async getAssignmentById(id: string): Promise<ProtocolAssignment> {
    const assignment = await this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError('Protocol assignment not found');
    }
    return assignment;
  }

  async getAssignments(filter?: {
    status?: 'assigned' | 'active' | 'completed' | 'paused';
    userId?: string;
    protocolId?: string;
  }): Promise<ProtocolAssignment[]> {
    return await this.assignmentRepo.findAll(filter);
  }

  async getUserAssignments(userId: string): Promise<ProtocolAssignment[]> {
    // Validate user exists
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return await this.assignmentRepo.findByUserId(userId);
  }

  async getProtocolAssignments(protocolId: string): Promise<ProtocolAssignment[]> {
    // Validate protocol exists
    const protocol = await this.protocolRepo.findById(protocolId);
    if (!protocol) {
      throw new NotFoundError('Protocol not found');
    }

    return await this.assignmentRepo.findByProtocolId(protocolId);
  }

  async startAssignment(id: string): Promise<ProtocolAssignment> {
    const assignment = await this.getAssignmentById(id);
    
    if (assignment.status !== 'assigned') {
      throw new ValidationError('Can only start assignments with status "assigned"');
    }

    const updatedAssignment = await this.assignmentRepo.markAsStarted(id);
    if (!updatedAssignment) {
      throw new NotFoundError('Failed to start assignment');
    }

    return updatedAssignment;
  }

  async updateProgress(
    id: string, 
    currentStep: number, 
    completedSteps: number
  ): Promise<ProtocolAssignment> {
    const assignment = await this.getAssignmentById(id);
    
    // Calculate adherence rate
    const adherenceRate = assignment.totalSteps > 0 
      ? ((completedSteps / assignment.totalSteps) * 100).toFixed(2)
      : '0.00';

    // Check if assignment should be marked as completed
    if (currentStep >= assignment.totalSteps) {
      const updatedAssignment = await this.assignmentRepo.markAsCompleted(id);
      if (!updatedAssignment) {
        throw new NotFoundError('Failed to complete assignment');
      }
      return updatedAssignment;
    }

    const updatedAssignment = await this.assignmentRepo.updateProgress(
      id, 
      currentStep, 
      completedSteps, 
      adherenceRate
    );
    
    if (!updatedAssignment) {
      throw new NotFoundError('Failed to update assignment progress');
    }

    return updatedAssignment;
  }

  async pauseAssignment(id: string): Promise<ProtocolAssignment> {
    const assignment = await this.assignmentRepo.update(id, { 
      status: 'paused' 
    });
    
    if (!assignment) {
      throw new NotFoundError('Protocol assignment not found');
    }

    return assignment;
  }

  async resumeAssignment(id: string): Promise<ProtocolAssignment> {
    const assignment = await this.getAssignmentById(id);
    
    if (assignment.status !== 'paused') {
      throw new ValidationError('Can only resume paused assignments');
    }

    const updatedAssignment = await this.assignmentRepo.update(id, { 
      status: 'active' 
    });
    
    if (!updatedAssignment) {
      throw new NotFoundError('Failed to resume assignment');
    }

    return updatedAssignment;
  }

  async completeAssignment(id: string): Promise<ProtocolAssignment> {
    const updatedAssignment = await this.assignmentRepo.markAsCompleted(id);
    if (!updatedAssignment) {
      throw new NotFoundError('Protocol assignment not found');
    }
    return updatedAssignment;
  }

  async deleteAssignment(id: string): Promise<void> {
    const deleted = await this.assignmentRepo.delete(id);
    if (!deleted) {
      throw new NotFoundError('Protocol assignment not found');
    }
  }

  async getAssignmentStats(): Promise<{
    total: number;
    assigned: number;
    active: number;
    completed: number;
    paused: number;
    averageAdherenceRate: number;
  }> {
    const [assigned, active, completed, paused, averageAdherenceRate] = await Promise.all([
      this.assignmentRepo.getAssignmentCountByStatus('assigned'),
      this.assignmentRepo.getAssignmentCountByStatus('active'),
      this.assignmentRepo.getAssignmentCountByStatus('completed'),
      this.assignmentRepo.getAssignmentCountByStatus('paused'),
      this.assignmentRepo.getAverageAdherenceRate(),
    ]);

    return {
      total: assigned + active + completed + paused,
      assigned,
      active,
      completed,
      paused,
      averageAdherenceRate,
    };
  }

  async getAssignmentsWithDetails(): Promise<Array<ProtocolAssignment & { 
    user: { displayName: string; realName: string | null }; 
    protocol: { name: string } 
  }>> {
    return await this.assignmentRepo.getAssignmentsWithUserAndProtocol();
  }
}