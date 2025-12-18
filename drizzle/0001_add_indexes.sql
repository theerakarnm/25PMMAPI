-- Add indexes for performance optimization
CREATE INDEX IF NOT EXISTS "idx_users_line_user_id" ON "users"("line_user_id");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users"("status");

CREATE INDEX IF NOT EXISTS "idx_admins_email" ON "admins"("email");

CREATE INDEX IF NOT EXISTS "idx_protocols_status" ON "protocols"("status");
CREATE INDEX IF NOT EXISTS "idx_protocols_created_by" ON "protocols"("created_by");

CREATE INDEX IF NOT EXISTS "idx_protocol_steps_protocol_id" ON "protocol_steps"("protocol_id");
CREATE INDEX IF NOT EXISTS "idx_protocol_steps_order" ON "protocol_steps"("protocol_id", "step_order");

CREATE INDEX IF NOT EXISTS "idx_protocol_assignments_user_id" ON "protocol_assignments"("user_id");
CREATE INDEX IF NOT EXISTS "idx_protocol_assignments_protocol_id" ON "protocol_assignments"("protocol_id");
CREATE INDEX IF NOT EXISTS "idx_protocol_assignments_status" ON "protocol_assignments"("status");

CREATE INDEX IF NOT EXISTS "idx_interaction_logs_user_id" ON "interaction_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_interaction_logs_protocol_id" ON "interaction_logs"("protocol_id");
CREATE INDEX IF NOT EXISTS "idx_interaction_logs_sent_at" ON "interaction_logs"("sent_at");
CREATE INDEX IF NOT EXISTS "idx_interaction_logs_status" ON "interaction_logs"("status");
CREATE INDEX IF NOT EXISTS "idx_interaction_logs_assignment_id" ON "interaction_logs"("assignment_id");

-- Add unique constraints
ALTER TABLE "protocol_steps" ADD CONSTRAINT IF NOT EXISTS "unique_protocol_step" UNIQUE("protocol_id", "step_order");
ALTER TABLE "protocol_assignments" ADD CONSTRAINT IF NOT EXISTS "unique_user_protocol" UNIQUE("user_id", "protocol_id");