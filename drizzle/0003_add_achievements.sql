-- Add user achievements table
CREATE TABLE IF NOT EXISTS "user_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"max_progress" integer DEFAULT 1 NOT NULL,
	"unlocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;

-- Create index on user_id for performance
CREATE INDEX IF NOT EXISTS "user_achievements_user_id_idx" ON "user_achievements" ("user_id");

-- Create unique constraint to prevent duplicate achievements
CREATE UNIQUE INDEX IF NOT EXISTS "user_achievements_user_achievement_idx" ON "user_achievements" ("user_id", "achievement_id"); 