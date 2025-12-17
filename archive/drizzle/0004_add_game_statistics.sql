-- Add game statistics tables for tracking player performance

-- Game Statistics table
CREATE TABLE IF NOT EXISTS "game_statistics" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "game_id" text NOT NULL,
  "participant_id" text NOT NULL,
  
  -- Game outcome
  "won" boolean NOT NULL,
  "survived" boolean NOT NULL,
  "rounds_played" integer NOT NULL,
  "game_duration" integer NOT NULL, -- in seconds
  
  -- Performance metrics
  "messages_count" integer DEFAULT 0 NOT NULL,
  "votes_count" integer DEFAULT 0 NOT NULL,
  "correct_votes" integer DEFAULT 0 NOT NULL, -- votes for actual mafia
  "votes_received" integer DEFAULT 0 NOT NULL,
  
  -- Role-specific stats
  "role_actions" integer DEFAULT 0 NOT NULL, -- seer investigations, doctor saves, mafia kills
  "successful_actions" integer DEFAULT 0 NOT NULL, -- successful saves, correct investigations
  
  -- Social metrics
  "trust_score" integer, -- calculated based on voting patterns
  "influence_score" integer, -- how often others followed their voting lead
  
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Aggregated User Statistics table (for fast queries)
CREATE TABLE IF NOT EXISTS "user_stats_summary" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  
  -- Overall stats
  "total_games" integer DEFAULT 0 NOT NULL,
  "total_wins" integer DEFAULT 0 NOT NULL,
  "win_rate" integer DEFAULT 0 NOT NULL, -- stored as percentage (0-100)
  
  -- Role-specific stats
  "games_as_villager" integer DEFAULT 0 NOT NULL,
  "wins_as_villager" integer DEFAULT 0 NOT NULL,
  "games_as_mafia" integer DEFAULT 0 NOT NULL,
  "wins_as_mafia" integer DEFAULT 0 NOT NULL,
  "games_as_seer" integer DEFAULT 0 NOT NULL,
  "wins_as_seer" integer DEFAULT 0 NOT NULL,
  "games_as_doctor" integer DEFAULT 0 NOT NULL,
  "wins_as_doctor" integer DEFAULT 0 NOT NULL,
  
  -- Streaks
  "current_win_streak" integer DEFAULT 0 NOT NULL,
  "longest_win_streak" integer DEFAULT 0 NOT NULL,
  
  -- Activity metrics
  "total_play_time" integer DEFAULT 0 NOT NULL, -- in seconds
  "average_game_duration" integer DEFAULT 0 NOT NULL, -- in seconds
  "last_played_at" timestamp,
  
  -- Social metrics
  "average_trust_score" integer DEFAULT 0 NOT NULL,
  "average_influence_score" integer DEFAULT 0 NOT NULL,
  "favorite_role" text, -- most played role
  
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_user_id_user_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_game_id_games_id_fk" 
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_participant_id_game_participants_id_fk" 
    FOREIGN KEY ("participant_id") REFERENCES "game_participants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_stats_summary" ADD CONSTRAINT "user_stats_summary_user_id_user_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "game_statistics_user_id_idx" ON "game_statistics" ("user_id");
CREATE INDEX IF NOT EXISTS "game_statistics_game_id_idx" ON "game_statistics" ("game_id");
CREATE INDEX IF NOT EXISTS "game_statistics_participant_id_idx" ON "game_statistics" ("participant_id");
CREATE INDEX IF NOT EXISTS "user_stats_summary_user_id_idx" ON "user_stats_summary" ("user_id"); 