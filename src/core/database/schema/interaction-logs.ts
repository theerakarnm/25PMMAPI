import z from "zod";
import { interactionLogs } from "../schema.js";

// Manual Zod schemas
export const insertInteractionLogSchema = z.object({
  userId: z.string().uuid(),
  protocolId: z.string().uuid(),
  stepId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  messageId: z.string().optional(),
  sentAt: z.date(),
  deliveredAt: z.date().optional(),
  respondedAt: z.date().optional(),
  responseValue: z.string().optional(),
  responseAction: z.string().optional(),
  timeDifferenceMs: z.number().int().optional(),
  status: z.enum(['sent', 'delivered', 'read', 'responded', 'missed']).optional(),
});

export const selectInteractionLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  protocolId: z.string().uuid(),
  stepId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  messageId: z.string().nullable(),
  sentAt: z.date(),
  deliveredAt: z.date().nullable(),
  respondedAt: z.date().nullable(),
  responseValue: z.string().nullable(),
  responseAction: z.string().nullable(),
  timeDifferenceMs: z.number().int().nullable(),
  status: z.enum(['sent', 'delivered', 'read', 'responded', 'missed']),
  createdAt: z.date(),
});

export type InteractionLog = typeof interactionLogs.$inferSelect;
export type NewInteractionLog = typeof interactionLogs.$inferInsert;
