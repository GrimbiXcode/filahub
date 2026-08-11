CREATE TYPE "public"."friend_visibility" AS ENUM('none', 'search', 'full');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."loan_request_status" AS ENUM('open', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"friendUserId" bigint NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"visibilityFromUser" "friend_visibility" DEFAULT 'search' NOT NULL,
	"visibilityFromFriend" "friend_visibility" DEFAULT 'search' NOT NULL,
	"respondedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_pair_unique" UNIQUE("userId","friendUserId")
);
--> statement-breakpoint
CREATE TABLE "loan_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"ownerUserId" bigint NOT NULL,
	"materialId" bigint NOT NULL,
	"materialName" varchar(255) NOT NULL,
	"message" varchar(300),
	"status" "loan_request_status" DEFAULT 'open' NOT NULL,
	"respondedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "friendCode" varchar(16);--> statement-breakpoint
CREATE INDEX "friendships_user_idx" ON "friendships" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "friendships_friend_idx" ON "friendships" USING btree ("friendUserId");--> statement-breakpoint
CREATE INDEX "loan_requests_owner_idx" ON "loan_requests" USING btree ("ownerUserId");--> statement-breakpoint
CREATE INDEX "loan_requests_user_idx" ON "loan_requests" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_friendCode_unique" UNIQUE("friendCode");--> statement-breakpoint
--
-- Ab hier von Hand ergänzt: drizzle-kit kann weder Ausdrucks- noch partielle
-- Indizes erzeugen. Beide Regeln gehören in die Datenbank und nicht in den
-- Anwendungscode – das Schema kennt keine Fremdschlüssel, umso mehr Gewicht
-- haben die Unique-Bedingungen. Wer das Schema hier ändert, muss diese beiden
-- Anweisungen in die neue Migration übernehmen.
--
-- 1. Eine Freundschaft je Paar, unabhängig davon, wer gefragt hat.
--    `friendships_pair_unique` deckt nur (A,B) ab; ohne den Index hier könnten
--    zwei gleichzeitige Anfragen zusätzlich (B,A) anlegen und damit zwei
--    widersprüchliche Sichtbarkeiten für dasselbe Paar.
CREATE UNIQUE INDEX "friendships_pair_canonical_unique" ON "friendships"
  (LEAST("userId", "friendUserId"), GREATEST("userId", "friendUserId"));--> statement-breakpoint
-- 2. Höchstens eine *offene* Anfrage je Person und Material. Beantwortete und
--    zurückgezogene Vorgänge bleiben als Verlauf stehen und dürfen sich
--    wiederholen – eine erneute Anfrage nach Wochen ist legitim.
CREATE UNIQUE INDEX "loan_requests_open_unique" ON "loan_requests"
  ("userId", "materialId") WHERE "status" = 'open';