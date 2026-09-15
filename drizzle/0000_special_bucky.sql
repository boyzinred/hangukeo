CREATE TYPE "public"."attempt_state" AS ENUM('in_progress', 'submitted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('vocab', 'grammar');--> statement-breakpoint
CREATE TYPE "public"."question_format" AS ENUM('ko_to_en_typed', 'en_to_ko_typed', 'vocab_choice', 'grammar_transform', 'grammar_choice', 'reading_choice');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'ta', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."test_status" AS ENUM('draft', 'review', 'published', 'closed');--> statement-breakpoint
CREATE TABLE "allowlist" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"state" "attempt_state" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"score" integer,
	"max_score" integer,
	"retake_granted_by" uuid,
	"retake_reason" text,
	CONSTRAINT "attempts_test_student_number" UNIQUE("test_id","student_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "class_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"term_start" date NOT NULL,
	"term_end" date NOT NULL,
	"vocab_goal" integer DEFAULT 1500 NOT NULL,
	"grammar_goal" integer DEFAULT 52 NOT NULL,
	"vocab_per_week" integer DEFAULT 125 NOT NULL,
	"grammar_per_week" integer DEFAULT 4 NOT NULL,
	"max_vocab_level" integer DEFAULT 2 NOT NULL,
	"max_grammar_level" integer DEFAULT 3 NOT NULL,
	"study_days_per_week" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_grammar" (
	"id" text PRIMARY KEY NOT NULL,
	"form" text NOT NULL,
	"name" text NOT NULL,
	"meaning" text NOT NULL,
	"shape" text,
	"level" integer NOT NULL,
	"examples" jsonb NOT NULL,
	"retired" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_vocab" (
	"id" text PRIMARY KEY NOT NULL,
	"korean" text NOT NULL,
	"english" text NOT NULL,
	"accepted_answers" text[] DEFAULT '{}' NOT NULL,
	"part_of_speech" text,
	"level" integer NOT NULL,
	"topic" text,
	"source_day" integer,
	"lessons" text[] DEFAULT '{}' NOT NULL,
	"retired" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"direction" text NOT NULL,
	"total" integer NOT NULL,
	"first_try_correct" integer NOT NULL,
	"scope" jsonb,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"vocab_id" text,
	"grammar_id" text,
	"format" "question_format" NOT NULL,
	"section" text NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"choices" text[],
	"correct_answer" text NOT NULL,
	"accepted_answers" text[] DEFAULT '{}' NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "questions_test_position" UNIQUE("test_id","position")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"vocab_id" text,
	"grammar_id" text,
	"answer" text,
	"is_correct" boolean,
	"needs_review" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_attempt_question" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"student_id" uuid PRIMARY KEY NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ta_id" uuid
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "test_status" DEFAULT 'draft' NOT NULL,
	"passage_ko" text,
	"passage_en" text,
	"time_limit_minutes" integer DEFAULT 30 NOT NULL,
	"spec" jsonb,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tests_week_plan_id_unique" UNIQUE("week_plan_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"birthday" date,
	"role" "role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "week_plan_grammar" (
	"week_plan_id" uuid NOT NULL,
	"grammar_id" text NOT NULL,
	CONSTRAINT "week_plan_grammar_week_plan_id_grammar_id_pk" PRIMARY KEY("week_plan_id","grammar_id")
);
--> statement-breakpoint
CREATE TABLE "week_plan_vocab" (
	"week_plan_id" uuid NOT NULL,
	"vocab_id" text NOT NULL,
	"study_day" integer NOT NULL,
	CONSTRAINT "week_plan_vocab_week_plan_id_vocab_id_pk" PRIMARY KEY("week_plan_id","vocab_id")
);
--> statement-breakpoint
CREATE TABLE "week_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_key" text NOT NULL,
	"week_number" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_plans_week_key_unique" UNIQUE("week_key")
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"week_key" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "weekly_reports_student_week" UNIQUE("student_id","week_key")
);
--> statement-breakpoint
ALTER TABLE "allowlist" ADD CONSTRAINT "allowlist_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_retake_granted_by_users_id_fk" FOREIGN KEY ("retake_granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_runs" ADD CONSTRAINT "practice_runs_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_vocab_id_corpus_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."corpus_vocab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_grammar_id_corpus_grammar_id_fk" FOREIGN KEY ("grammar_id") REFERENCES "public"."corpus_grammar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_vocab_id_corpus_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."corpus_vocab"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_grammar_id_corpus_grammar_id_fk" FOREIGN KEY ("grammar_id") REFERENCES "public"."corpus_grammar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_ta_id_users_id_fk" FOREIGN KEY ("ta_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_week_plan_id_week_plans_id_fk" FOREIGN KEY ("week_plan_id") REFERENCES "public"."week_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan_grammar" ADD CONSTRAINT "week_plan_grammar_week_plan_id_week_plans_id_fk" FOREIGN KEY ("week_plan_id") REFERENCES "public"."week_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan_grammar" ADD CONSTRAINT "week_plan_grammar_grammar_id_corpus_grammar_id_fk" FOREIGN KEY ("grammar_id") REFERENCES "public"."corpus_grammar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan_vocab" ADD CONSTRAINT "week_plan_vocab_week_plan_id_week_plans_id_fk" FOREIGN KEY ("week_plan_id") REFERENCES "public"."week_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan_vocab" ADD CONSTRAINT "week_plan_vocab_vocab_id_corpus_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."corpus_vocab"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_student_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "corpus_grammar_level_idx" ON "corpus_grammar" USING btree ("level");--> statement-breakpoint
CREATE INDEX "corpus_vocab_level_idx" ON "corpus_vocab" USING btree ("level");--> statement-breakpoint
CREATE INDEX "corpus_vocab_korean_idx" ON "corpus_vocab" USING btree ("korean");--> statement-breakpoint
CREATE INDEX "responses_student_vocab_idx" ON "responses" USING btree ("student_id","vocab_id");--> statement-breakpoint
CREATE INDEX "responses_student_grammar_idx" ON "responses" USING btree ("student_id","grammar_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "week_plan_vocab_day_idx" ON "week_plan_vocab" USING btree ("week_plan_id","study_day");--> statement-breakpoint
CREATE INDEX "week_plans_number_idx" ON "week_plans" USING btree ("week_number");