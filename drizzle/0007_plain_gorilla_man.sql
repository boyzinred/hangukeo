ALTER TABLE "class_settings" ADD COLUMN "test_vocab_count" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "test_grammar_count" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "test_time_limit_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_settings" ADD COLUMN "test_review_share" integer DEFAULT 35 NOT NULL;