import z from "zod";
import { protocolAssignments } from "../schema.js";

// Manual Zod schemas
export const insertProtocolAssignmentSchema = z.object({
  userId: z.string().uuid(),
  protocolId: z.string().uuid(),
  assignedAt: z.date().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  currentStep: z.number().int().optional(),
  status: z.enum(['assigned', 'active', 'completed', 'paused']).optional(),
  totalSteps: z.number().int().optional(),
  completedSteps: z.number().int().optional(),
  adherenceRate: z.string().regex(/^\d+\.\d{2}$/).optional(),
});

export const selectProtocolAssignmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  protocolId: z.string().uuid(),
  assignedAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  currentStep: z.number().int(),
  status: z.enum(['assigned', 'active', 'completed', 'paused']),
  totalSteps: z.number().int(),
  completedSteps: z.number().int(),
  adherenceRate: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProtocolAssignment = typeof protocolAssignments.$inferSelect;
export type NewProtocolAssignment = typeof protocolAssignments.$inferInsert;