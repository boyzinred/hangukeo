-- Move from magic-link sign-in to teacher-issued username + password.
--
-- The allowlist goes away: accounts now exist only because the teacher created
-- them, so account creation is itself the gate.

ALTER TABLE "allowlist" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "allowlist" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint

-- Added nullable and backfilled before the NOT NULL, so this runs against a
-- table that already has rows. Drizzle generates a bare NOT NULL add, which
-- would fail on anything but an empty table.
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "users"
   SET "username" = regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9]', '', 'g')
 WHERE "username" IS NULL;--> statement-breakpoint
-- Two people whose local parts collapse to the same string would break the
-- unique index, so disambiguate before adding it.
UPDATE "users" u
   SET "username" = u."username" || substr(u."id"::text, 1, 4)
  FROM (
    SELECT "username" AS dupe FROM "users" GROUP BY "username" HAVING count(*) > 1
  ) d
 WHERE u."username" = d.dupe;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
