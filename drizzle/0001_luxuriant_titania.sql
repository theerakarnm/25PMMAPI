ALTER TABLE "protocol_steps" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_admins_email" ON "admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_interaction_logs_user_id" ON "interaction_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_logs_protocol_id" ON "interaction_logs" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_interaction_logs_sent_at" ON "interaction_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_logs_status" ON "interaction_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_interaction_logs_assignment_id" ON "interaction_logs" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_protocol_assignments_user_id" ON "protocol_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_protocol_assignments_protocol_id" ON "protocol_assignments" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_protocol_assignments_status" ON "protocol_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_protocol_steps_protocol_id" ON "protocol_steps" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_protocol_steps_order" ON "protocol_steps" USING btree ("protocol_id","step_order");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_protocol_step_active" ON "protocol_steps" USING btree ("protocol_id","step_order") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_protocols_status" ON "protocols" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_protocols_created_by" ON "protocols" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_users_line_user_id" ON "users" USING btree ("line_user_id");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
ALTER TABLE "protocol_assignments" ADD CONSTRAINT "unique_user_protocol" UNIQUE("user_id","protocol_id");