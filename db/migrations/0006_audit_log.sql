CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" varchar(64) NOT NULL,
	"actorUserId" bigint,
	"subjectUserId" bigint,
	"telegramId" varchar(64),
	"ipHash" varchar(64),
	"detail" jsonb
);
--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_event_at_idx" ON "audit_log" USING btree ("event","at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actorUserId");