CREATE TABLE "discord_login_requests" (
	"stateHash" varchar(64) PRIMARY KEY NOT NULL,
	"bindingHash" varchar(64) NOT NULL,
	"verifier" varchar(128) NOT NULL,
	"purpose" varchar(8) DEFAULT 'login' NOT NULL,
	"userId" bigint,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"handoffCodeHash" varchar(64),
	"handoffExpiresAt" timestamp with time zone,
	"handoffFailures" integer DEFAULT 0 NOT NULL,
	"discordId" varchar(32),
	"discordUsername" varchar(255),
	"discordGlobalName" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_login_requests_bindingHash_unique" UNIQUE("bindingHash"),
	CONSTRAINT "discord_login_requests_purpose_user" CHECK (("discord_login_requests"."purpose" = 'link') = ("discord_login_requests"."userId" IS NOT NULL) AND "discord_login_requests"."purpose" IN ('login', 'link'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discordId" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discordUsername" varchar(255);--> statement-breakpoint
ALTER TABLE "discord_login_requests" ADD CONSTRAINT "discord_login_requests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_login_requests_expires_idx" ON "discord_login_requests" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "discord_login_requests_user_idx" ON "discord_login_requests" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_discordId_unique" UNIQUE("discordId");