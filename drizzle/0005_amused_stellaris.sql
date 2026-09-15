ALTER TABLE "users" ADD COLUMN "roles" "role"[] DEFAULT '{"student"}' NOT NULL;--> statement-breakpoint
-- Carry each existing single role into the array. Written by hand because the
-- generated migration only adds the column with its default.
UPDATE "users" SET "roles" = ARRAY["role"]::"public"."role"[];
