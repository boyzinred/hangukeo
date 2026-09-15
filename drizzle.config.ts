import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/*
 * Loaded with dotenv rather than sourced by the shell: a password containing
 * a backtick, $, or quote is valid in a connection string but would be run as
 * shell syntax by `. ./.env.local`.
 *
 * ENV_FILE selects the target — `.env.local` (local Supabase) by default,
 * `.env.cloud.local` for the hosted project.
 */
config({ path: process.env.ENV_FILE ?? ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
