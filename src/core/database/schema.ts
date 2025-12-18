import { pgTable, text, uuid, varchar, timestamp, boolean, jsonb, integer, decimal, index, unique } from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('admin').$type<'admin' | 'researcher'>(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([{
  emailIdx: index('idx_admins_email').on(table.email),
}]));

export const interactionLogs = pgTable('interaction_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  protocolId: uuid('protocol_id').notNull().references(() => protocols.id),
  stepId: uuid('step_id').notNull().references(() => protocolSteps.id),
  assignmentId: uuid('assignment_id').notNull().references(() => protocolAssignments.id),
  messageId: varchar('message_id', { length: 255 }), // LINE message ID
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  responseValue: text('response_value'),
  responseAction: varchar('response_action', { length: 50 }),
  timeDifferenceMs: integer('time_difference_ms'), // Milliseconds between sent and responded
  status: varchar('status', { length: 20 }).notNull().default('sent').$type<'sent' | 'delivered' | 'read' | 'responded' | 'missed' | 'failed'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ([{
  userIdIdx: index('idx_interaction_logs_user_id').on(table.userId),
  protocolIdIdx: index('idx_interaction_logs_protocol_id').on(table.protocolId),
  sentAtIdx: index('idx_interaction_logs_sent_at').on(table.sentAt),
  statusIdx: index('idx_interaction_logs_status').on(table.status),
  assignmentIdIdx: index('idx_interaction_logs_assignment_id').on(table.assignmentId),
}]));

export const protocolAssignments = pgTable('protocol_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  protocolId: uuid('protocol_id').notNull().references(() => protocols.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  currentStep: integer('current_step').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('assigned').$type<'assigned' | 'active' | 'completed' | 'paused'>(),
  totalSteps: integer('total_steps').notNull().default(0),
  completedSteps: integer('completed_steps').notNull().default(0),
  adherenceRate: decimal('adherence_rate', { precision: 5, scale: 2 }).default('0.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ([{
  userIdIdx: index('idx_protocol_assignments_user_id').on(table.userId),
  protocolIdIdx: index('idx_protocol_assignments_protocol_id').on(table.protocolId),
  statusIdx: index('idx_protocol_assignments_status').on(table.status),
  uniqueUserProtocol: unique('unique_user_protocol').on(table.userId, table.protocolId),
}]));

export const protocols = pgTable('protocols', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdBy: uuid('created_by').notNull().references(() => admins.id),
  status: varchar('status', { length: 20 }).notNull().default('draft').$type<'draft' | 'active' | 'paused' | 'completed'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([{
  statusIdx: index('idx_protocols_status').on(table.status),
  createdByIdx: index('idx_protocols_created_by').on(table.createdBy),
}]));

export const protocolSteps = pgTable('protocol_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  protocolId: uuid('protocol_id').notNull().references(() => protocols.id, { onDelete: 'cascade' }),
  stepOrder: varchar('step_order', { length: 10 }).notNull(),
  triggerType: varchar('trigger_type', { length: 20 }).notNull().$type<'immediate' | 'delay' | 'scheduled'>(),
  triggerValue: varchar('trigger_value', { length: 100 }).notNull(),
  messageType: varchar('message_type', { length: 20 }).notNull().$type<'text' | 'image' | 'link' | 'flex'>(),
  contentPayload: jsonb('content_payload').notNull(),
  requiresAction: boolean('requires_action').notNull().default(false),
  feedbackConfig: jsonb('feedback_config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ([{
  protocolIdIdx: index('idx_protocol_steps_protocol_id').on(table.protocolId),
  orderIdx: index('idx_protocol_steps_order').on(table.protocolId, table.stepOrder),
  uniqueProtocolStep: unique('unique_protocol_step').on(table.protocolId, table.stepOrder),
}]));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  lineUserId: varchar('line_user_id', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  pictureUrl: text('picture_url'),
  realName: varchar('real_name', { length: 255 }),
  hospitalNumber: varchar('hospital_number', { length: 100 }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('active').$type<'active' | 'inactive'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ([{
  lineUserIdIdx: index('idx_users_line_user_id').on(table.lineUserId),
  statusIdx: index('idx_users_status').on(table.status),
}]));