CREATE TYPE "public"."unblock_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "unblock_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"message" text NOT NULL,
	"status" "unblock_request_status" DEFAULT 'pending' NOT NULL,
	"reviewedBy" bigint,
	"reviewedAt" timestamp with time zone,
	"reviewNote" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blockedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blockedBy" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blockedReason" varchar(32);--> statement-breakpoint
CREATE INDEX "unblock_requests_status_idx" ON "unblock_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "unblock_requests_user_idx" ON "unblock_requests" USING btree ("userId");--> statement-breakpoint
-- Von Hand ergänzt, weil Drizzle partielle Unique-Indizes nicht aus dem Schema
-- erzeugt (dasselbe Vorgehen wie bei `loan_requests_open_unique` in
-- 0008_friends.sql). Wer das Schema hier ändert, muss diese Anweisung in die
-- neue Migration übernehmen.
--
-- Höchstens ein *offener* Entsperr-Antrag je Konto. Beschiedene Anträge bleiben
-- als Verlauf stehen und dürfen sich wiederholen – wer nach einer erneuten
-- Sperre erneut vorstellig wird, ist im Recht. Ohne den Index ließe sich die
-- Warteschlange der Moderation mit Anträgen desselben Kontos fluten, und genau
-- das ist der Missbrauch, gegen den diese Migration antritt.
CREATE UNIQUE INDEX "unblock_requests_open_unique" ON "unblock_requests"
  ("userId") WHERE "status" = 'pending';
