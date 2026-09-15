CREATE TABLE "practice_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"vocab_id" text,
	"grammar_id" text,
	"first_try" boolean NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_run_id_practice_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."practice_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_vocab_id_corpus_vocab_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."corpus_vocab"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_responses" ADD CONSTRAINT "practice_responses_grammar_id_corpus_grammar_id_fk" FOREIGN KEY ("grammar_id") REFERENCES "public"."corpus_grammar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_responses_student_vocab_idx" ON "practice_responses" USING btree ("student_id","vocab_id");--> statement-breakpoint
CREATE INDEX "practice_responses_student_grammar_idx" ON "practice_responses" USING btree ("student_id","grammar_id");