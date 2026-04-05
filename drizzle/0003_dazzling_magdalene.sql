ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pendingChanges" jsonb;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "linearProjectId" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "linearTeamId" text;