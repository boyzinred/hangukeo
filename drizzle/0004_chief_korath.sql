ALTER TABLE "attempts" DROP CONSTRAINT "attempts_retake_granted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tests" DROP CONSTRAINT "tests_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_retake_granted_by_users_id_fk" FOREIGN KEY ("retake_granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;