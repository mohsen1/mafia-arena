CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"role_name" text NOT NULL,
	"allegiance" text NOT NULL,
	"is_human" boolean DEFAULT false NOT NULL,
	"is_alive" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_statistics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"won" boolean NOT NULL,
	"survived" boolean NOT NULL,
	"rounds_played" integer NOT NULL,
	"game_duration" integer NOT NULL,
	"messages_count" integer DEFAULT 0 NOT NULL,
	"votes_count" integer DEFAULT 0 NOT NULL,
	"correct_votes" integer DEFAULT 0 NOT NULL,
	"votes_received" integer DEFAULT 0 NOT NULL,
	"role_actions" integer DEFAULT 0 NOT NULL,
	"successful_actions" integer DEFAULT 0 NOT NULL,
	"trust_score" integer,
	"influence_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text,
	"theme_key" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"phase" text DEFAULT 'Init' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"win_condition" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"game_state" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"max_progress" integer DEFAULT 1 NOT NULL,
	"unlocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"key_name" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"preferred_theme" text DEFAULT 'system' NOT NULL,
	"default_game_theme" text DEFAULT 'UK_VILLAGE_1900S' NOT NULL,
	"preferred_ai_model" text DEFAULT 'gemma2-9b-it' NOT NULL,
	"enable_sound_effects" boolean DEFAULT true NOT NULL,
	"enable_tts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_games" integer DEFAULT 0 NOT NULL,
	"total_wins" integer DEFAULT 0 NOT NULL,
	"win_rate" integer DEFAULT 0 NOT NULL,
	"games_as_villager" integer DEFAULT 0 NOT NULL,
	"wins_as_villager" integer DEFAULT 0 NOT NULL,
	"games_as_mafia" integer DEFAULT 0 NOT NULL,
	"wins_as_mafia" integer DEFAULT 0 NOT NULL,
	"games_as_seer" integer DEFAULT 0 NOT NULL,
	"wins_as_seer" integer DEFAULT 0 NOT NULL,
	"games_as_doctor" integer DEFAULT 0 NOT NULL,
	"wins_as_doctor" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"longest_win_streak" integer DEFAULT 0 NOT NULL,
	"total_play_time" integer DEFAULT 0 NOT NULL,
	"average_game_duration" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp,
	"average_trust_score" integer DEFAULT 0 NOT NULL,
	"average_influence_score" integer DEFAULT 0 NOT NULL,
	"favorite_role" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_summary_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_participant_id_game_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."game_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats_summary" ADD CONSTRAINT "user_stats_summary_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;