-- Lock every application table out of Supabase auto-generated REST API.
--
-- Supabase exposes PostgREST on the anon and authenticated roles. Our tables
-- have no grants for those roles, so reads already fail — but that is an
-- accident of how the schema was created, and one stray
-- `grant select on all tables ... to anon` would expose every student result.
-- Enabling RLS with no policies makes the lockout explicit and survives that.
--
-- This is NOT the application authorization layer. Drizzle connects as
-- `postgres`, which has BYPASSRLS, so these never apply to our own queries.
-- Authorization lives in src/lib/session.ts and is enforced in server
-- components and server actions, close to the data.

alter table "users" enable row level security;--> statement-breakpoint
alter table "teams" enable row level security;--> statement-breakpoint
alter table "team_members" enable row level security;--> statement-breakpoint
alter table "class_settings" enable row level security;--> statement-breakpoint
alter table "corpus_vocab" enable row level security;--> statement-breakpoint
alter table "corpus_grammar" enable row level security;--> statement-breakpoint
alter table "week_plans" enable row level security;--> statement-breakpoint
alter table "week_plan_vocab" enable row level security;--> statement-breakpoint
alter table "week_plan_grammar" enable row level security;--> statement-breakpoint
alter table "tests" enable row level security;--> statement-breakpoint
alter table "questions" enable row level security;--> statement-breakpoint
alter table "attempts" enable row level security;--> statement-breakpoint
alter table "responses" enable row level security;--> statement-breakpoint
alter table "practice_runs" enable row level security;--> statement-breakpoint
alter table "practice_responses" enable row level security;--> statement-breakpoint
alter table "weekly_reports" enable row level security;--> statement-breakpoint

revoke all on all tables in schema public from anon, authenticated;--> statement-breakpoint
alter default privileges in schema public revoke all on tables from anon, authenticated;
